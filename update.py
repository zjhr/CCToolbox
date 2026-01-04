#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time
from pathlib import Path

TOTAL_STEPS = 6


def emit_step(step, message):
    print(f"[{step}/{TOTAL_STEPS}] {message}", flush=True)


def run_command(command, cwd=None, allow_failure=False):
    process = subprocess.Popen(
        command,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )

    output_lines = []
    while True:
        line = process.stdout.readline() if process.stdout else ''
        if not line and process.poll() is not None:
            break
        if line:
            output_lines.append(line.rstrip())
            print(line.rstrip(), flush=True)

    return_code = process.wait()
    if return_code != 0 and not allow_failure:
        raise RuntimeError(f"命令执行失败: {' '.join(command)}")
    return output_lines


def get_repo_root():
    return Path(__file__).resolve().parent


def load_config_port():
    config_path = Path.home() / '.claude' / 'cctoolbox' / 'config.json'
    if not config_path.exists():
        return 9999
    try:
        data = json.loads(config_path.read_text(encoding='utf-8'))
        return int(data.get('ports', {}).get('webUI', 9999))
    except Exception:
        return 9999


def ensure_clean_repo(root_dir):
    status = subprocess.check_output(['git', 'status', '--porcelain'], cwd=root_dir, text=True).strip()
    if status:
        print('更新前检测到本地修改，请先处理后再更新。', flush=True)
        print(status, flush=True)
        sys.exit(1)


def read_package_version(root_dir):
    package_path = root_dir / 'package.json'
    if not package_path.exists():
        return 'unknown'
    data = json.loads(package_path.read_text(encoding='utf-8'))
    return data.get('version', 'unknown')


def rollback(root_dir, prev_commit):
    print('更新失败，正在回滚到上一个版本...', flush=True)
    subprocess.run(['git', 'reset', '--hard', prev_commit], cwd=root_dir, check=False)
    run_command(['npm', 'install', '--production'], cwd=root_dir, allow_failure=True)
    run_command(['npm', 'run', 'build:web'], cwd=root_dir, allow_failure=True)
    reload_pm2(root_dir, allow_failure=True)


def reload_pm2(root_dir, allow_failure=False):
    commands = [
        ['pm2', 'reload', 'cctoolbox-ui'],
        ['pm2', 'reload', 'cctoolbox']
    ]
    for command in commands:
        try:
            run_command(command, cwd=root_dir, allow_failure=allow_failure)
        except Exception:
            if not allow_failure:
                raise
            print(f"⚠️ PM2 重启失败: {' '.join(command)}", flush=True)


def health_check(port):
    url = f'http://localhost:{port}/health'
    subprocess.run(['curl', '-f', url], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    root_dir = get_repo_root()

    prev_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root_dir, text=True).strip()
    prev_version = read_package_version(root_dir)

    try:
        emit_step(1, '检查本地修改')
        ensure_clean_repo(root_dir)

        emit_step(2, f'拉取最新代码 (当前版本 {prev_version})')
        run_command(['git', 'pull', 'origin', 'main'], cwd=root_dir)

        emit_step(3, '安装依赖')
        run_command(['npm', 'install', '--production'], cwd=root_dir)

        emit_step(4, '构建前端资源')
        run_command(['npm', 'install'], cwd=root_dir / 'src' / 'web')
        run_command(['npm', 'run', 'build'], cwd=root_dir / 'src' / 'web')

        emit_step(5, '重启服务')
        reload_pm2(root_dir)
        time.sleep(5)

        emit_step(6, '健康检查')
        port = load_config_port()
        health_check(port)

        print('✅ 更新完成，服务已重启。', flush=True)
    except Exception as exc:
        print(f'❌ 更新失败: {exc}', flush=True)
        rollback(root_dir, prev_commit)
        sys.exit(1)


if __name__ == '__main__':
    main()
