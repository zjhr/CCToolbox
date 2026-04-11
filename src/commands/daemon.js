const pm2 = require('pm2');
const path = require('path');
const chalk = require('chalk');
const { loadConfig, saveConfig } = require('../config/loader');
const { getLogFile } = require('../utils/app-path-manager');
const { canBindPort, findAvailablePort } = require('../utils/port-helper');

const PM2_APP_NAME = 'cctoolbox';
const LEGACY_PM2_NAMES = ['coding-tool', 'cc-tool'];

/**
 * 连接到 PM2
 */
function connectPM2() {
  return new Promise((resolve, reject) => {
    pm2.connect((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * 断开 PM2 连接
 */
function disconnectPM2() {
  pm2.disconnect();
}

/**
 * 获取进程列表
 */
function getProcessList() {
  return new Promise((resolve, reject) => {
    pm2.list((err, list) => {
      if (err) {
        reject(err);
      } else {
        resolve(list);
      }
    });
  });
}

/**
 * 获取 CCToolbox 进程
 */
async function getCCToolProcess() {
  const list = await getProcessList();
  const candidates = [PM2_APP_NAME, ...LEGACY_PM2_NAMES];
  for (const name of candidates) {
    const proc = list.find(item => item.name === name);
    if (proc) {
      return { proc, name };
    }
  }
  return { proc: null, name: PM2_APP_NAME };
}

/**
 * 启动服务（后台）
 */
async function handleStart() {
  try {
    await connectPM2();

    // 检查是否已经在运行
    const existing = await getCCToolProcess();
    if (existing.proc && existing.proc.pm2_env.status === 'online') {
      console.log(chalk.yellow('\n⚠️  服务已在运行中\n'));
      console.log(chalk.gray(`进程 ID: ${existing.proc.pid}`));
      console.log(chalk.gray(`运行时长: ${formatUptime(existing.proc.pm2_env.pm_uptime)}`));
      console.log(chalk.gray('\n使用 ') + chalk.cyan('ct status') + chalk.gray(' 查看详细状态'));
      console.log(chalk.gray('使用 ') + chalk.cyan('ct restart') + chalk.gray(' 重启服务\n'));
      disconnectPM2();
      return;
    }

    const config = loadConfig();
    const originalPort = config.ports?.webUI || 10099;
    let port = originalPort;

    const canBindOriginalPort = await canBindPort(port);
    if (!canBindOriginalPort) {
      const fallbackStart = port >= 18099 ? port + 1 : 18099;
      const fallbackPort = await findAvailablePort(fallbackStart);
      if (!fallbackPort) {
        throw new Error(`Web UI port ${port} is unavailable, and no fallback port could be found`);
      }

      config.ports = { ...(config.ports || {}), webUI: fallbackPort };
      saveConfig(config);
      port = fallbackPort;

      console.log(chalk.yellow(`\n⚠️  Web UI 端口 ${originalPort} 不可用，已自动切换到 ${fallbackPort}`));
    }

    // 启动 PM2 进程
    const appName = existing.proc ? existing.name : PM2_APP_NAME;
    pm2.start({
      name: appName,
      script: path.join(__dirname, '../index.js'),
      args: ['ui', '--daemon'],
      // 使用当前 Node 绝对路径，避免开机自启时 PATH 缺失导致无法启动
      interpreter: process.execPath,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        CC_TOOL_PORT: port
      },
      output: getLogFile('out'),
      error: getLogFile('error'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }, (err) => {
      if (err) {
        console.error(chalk.red('\n❌ 启动服务失败:'), err.message);
        disconnectPM2();
        process.exit(1);
      }

      console.log(chalk.green('\n✅ CCToolbox 服务已启动（后台运行）\n'));
      console.log(chalk.gray(`Web UI: http://localhost:${port}`));
      console.log(chalk.gray('\n可以安全关闭此终端窗口'));
      console.log(chalk.gray('\n常用命令:'));
      console.log(chalk.gray('  ') + chalk.cyan('ct status') + chalk.gray('   - 查看服务状态'));
      console.log(chalk.gray('  ') + chalk.cyan('ct logs') + chalk.gray('      - 查看实时日志'));
      console.log(chalk.gray('  ') + chalk.cyan('ct stop') + chalk.gray('      - 停止服务\n'));

      // 保存进程列表
      pm2.dump((err) => {
        disconnectPM2();
      });
    });
  } catch (error) {
    console.error(chalk.red('启动失败:'), error.message);
    disconnectPM2();
    process.exit(1);
  }
}

/**
 * 停止服务
 */
async function handleStop() {
  try {
    await connectPM2();

    const existing = await getCCToolProcess();
    if (!existing.proc) {
      console.log(chalk.yellow('\n⚠️  服务未在运行\n'));
      disconnectPM2();
      return;
    }

    pm2.stop(existing.name, (err) => {
      if (err) {
        console.error(chalk.red('\n❌ 停止服务失败:'), err.message);
        disconnectPM2();
        process.exit(1);
      }

      // 删除进程
      pm2.delete(existing.name, (err) => {
        if (err) {
          console.error(chalk.red('删除进程失败:'), err.message);
        } else {
          console.log(chalk.green('\n✅ CCToolbox 服务已停止\n'));
        }

        pm2.dump((err) => {
          disconnectPM2();
        });
      });
    });
  } catch (error) {
    console.error(chalk.red('停止失败:'), error.message);
    disconnectPM2();
    process.exit(1);
  }
}

/**
 * 重启服务
 */
async function handleRestart() {
  try {
    await connectPM2();

    const existing = await getCCToolProcess();
    if (!existing.proc) {
      console.log(chalk.yellow('\n⚠️  服务未在运行，请使用 ') + chalk.cyan('ct start') + chalk.yellow(' 启动\n'));
      disconnectPM2();
      return;
    }

    pm2.restart(existing.name, (err) => {
      if (err) {
        console.error(chalk.red('\n❌ 重启服务失败:'), err.message);
        disconnectPM2();
        process.exit(1);
      }

      console.log(chalk.green('\n✅ CCToolbox 服务已重启\n'));

      pm2.dump((err) => {
        disconnectPM2();
      });
    });
  } catch (error) {
    console.error(chalk.red('重启失败:'), error.message);
    disconnectPM2();
    process.exit(1);
  }
}

/**
 * 查看服务状态
 */
async function handleStatus() {
  try {
    await connectPM2();

    const existing = await getCCToolProcess();
    const config = loadConfig();

    console.log(chalk.bold.cyan('\n╔══════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║        CCToolbox 服务状态         ║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════════════╝\n'));

    // UI 服务状态
    console.log(chalk.bold('📱 Web UI 服务:'));
    if (existing.proc && existing.proc.pm2_env.status === 'online') {
      console.log(chalk.green('  ✅ 状态: 运行中'));
      console.log(chalk.gray(`  🌐 地址: http://localhost:${config.ports?.webUI || 10099}`));
      console.log(chalk.gray(`  🔑 进程 ID: ${existing.proc.pid}`));
      console.log(chalk.gray(`  ⏱️  运行时长: ${formatUptime(existing.proc.pm2_env.pm_uptime)}`));
      console.log(chalk.gray(`  💾 内存使用: ${formatMemory(existing.proc.monit?.memory)}`));
      console.log(chalk.gray(`  🔄 重启次数: ${existing.proc.pm2_env.restart_time}`));
    } else {
      console.log(chalk.gray('  ❌ 状态: 未运行'));
    }

    // 代理服务状态（从运行时文件检测）
    const fs = require('fs');
    const os = require('os');
    const claudeActive = fs.existsSync(path.join(os.homedir(), '.claude/.proxy-active-claude'));
    const codexActive = fs.existsSync(path.join(os.homedir(), '.claude/.proxy-active-codex'));
    const geminiActive = fs.existsSync(path.join(os.homedir(), '.claude/.proxy-active-gemini'));

    console.log(chalk.bold('\n🔌 代理服务:'));

    console.log(chalk.gray('  Claude:  ') + (claudeActive ? chalk.green('✅ 运行中') : chalk.gray('⏹️  未启动')) +
      chalk.gray(` (http://localhost:${config.ports?.proxy || 10088})`));

    console.log(chalk.gray('  Codex:   ') + (codexActive ? chalk.green('✅ 运行中') : chalk.gray('⏹️  未启动')) +
      chalk.gray(` (http://localhost:${config.ports?.codexProxy || 10089})`));

    console.log(chalk.gray('  Gemini:  ') + (geminiActive ? chalk.green('✅ 运行中') : chalk.gray('⏹️  未启动')) +
      chalk.gray(` (http://localhost:${config.ports?.geminiProxy || 10090})`));

    console.log(chalk.bold('\n💡 提示:'));
    console.log(chalk.gray('  • 代理服务通过 Web UI 界面控制'));
    console.log(chalk.gray('  • 使用 ') + chalk.cyan('ct logs [type]') + chalk.gray(' 查看日志'));
    console.log(chalk.gray('  • 使用 ') + chalk.cyan('ct stats [type]') + chalk.gray(' 查看统计信息\n'));

    disconnectPM2();
  } catch (error) {
    console.error(chalk.red('查询状态失败:'), error.message);
    disconnectPM2();
    process.exit(1);
  }
}

/**
 * 格式化运行时长
 */
function formatUptime(startTime) {
  const uptime = Date.now() - startTime;
  const seconds = Math.floor(uptime / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}天 ${hours % 24}小时`;
  } else if (hours > 0) {
    return `${hours}小时 ${minutes % 60}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分钟`;
  } else {
    return `${seconds}秒`;
  }
}

/**
 * 格式化内存使用
 */
function formatMemory(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
}

module.exports = {
  handleStart,
  handleStop,
  handleRestart,
  handleStatus
};
