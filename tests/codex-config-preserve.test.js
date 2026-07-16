/**
 * 最小自检：codex 开启代理后不得覆写/丢失主人 config.toml 原有配置
 *
 * 根因：codex-settings-manager 的 configToToml 手写序列化只处理
 *   string/boolean/number 三种类型，静默丢弃数组、嵌套 table、env 对象等，
 *   导致 setProxyConfig -> writeConfig 后主人 config.toml 里的
 *   mcp_servers / preferred_auth_methods / model_providers.*.env 等被清空。
 *
 * 修复：改用 @iarna/toml.stringify 做无损往返序列化。
 *
 * 该自检会在修复前的代码上失败（mcp_servers 等被丢弃），
 * 在修复后的代码上通过。
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

async function withTempHome(run) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cctoolbox-codex-config-preserve-test-')
  );
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const originalShell = process.env.SHELL;

  process.env.HOME = tempRoot;
  process.env.USERPROFILE = tempRoot;
  process.env.SHELL = '/bin/bash';

  try {
    return await run(tempRoot);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = originalShell;
    removeDir(tempRoot);
  }
}

function loadCodexSettingsManager() {
  delete require.cache[require.resolve('../src/server/services/codex-settings-manager')];
  delete require.cache[require.resolve('../src/utils/app-path-manager')];
  return require('../src/server/services/codex-settings-manager');
}

// 主人一个真实丰富的 config.toml：含数组、嵌套 table、env 对象、注释
const RICH_CONFIG = `# 我的 Codex 配置（含各类字段，验证开启代理后不被丢失）
model = "gpt-5"
model_provider = "openai"
preferred_auth_methods = ["chatgpt", "apikey"]
hide_agent_reasoning = true
notify_interval = 5

[model_providers.openai]
name = "OpenAI"
base_url = "https://api.openai.com/v1"
env_key = "OPENAI_API_KEY"

[model_providers.openai.env]
OPENAI_API_KEY = "sk-xxx"

[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem"]
`;

async function main() {
  await withTempHome(async (tempRoot) => {
    // 屏蔽 setProxyConfig 内部的 shell env 注入（与本次回归无关）
    const originalExec = childProcess.execFileSync;
    childProcess.execFileSync = () => Buffer.from('');

    try {
      const codexDir = path.join(tempRoot, '.codex');
      fs.mkdirSync(codexDir, { recursive: true });
      fs.writeFileSync(path.join(codexDir, 'config.toml'), RICH_CONFIG, 'utf8');
      fs.writeFileSync(
        path.join(codexDir, 'auth.json'),
        JSON.stringify({ OPENAI_API_KEY: 'sk-xxx' }),
        'utf8'
      );

      const { setProxyConfig, readConfig } = loadCodexSettingsManager();

      // 开启代理（等价于主人在 UI 点"开启 codex 代理"）
      setProxyConfig(10089);

      // 重新读取代理生效后的 config.toml
      const after = readConfig();

      // 1) 代理配置正确写入
      assert.strictEqual(after.model_provider, 'cc-proxy', '应设置 model_provider 为 cc-proxy');
      assert.ok(
        after.model_providers && after.model_providers['cc-proxy'],
        '应添加 cc-proxy provider'
      );
      assert.strictEqual(
        after.model_providers['cc-proxy'].base_url,
        'http://127.0.0.1:10089/v1',
        'cc-proxy base_url 应指向本地代理'
      );

      // 2) ★核心回归★：主人原有配置不得丢失
      assert.deepStrictEqual(
        after.preferred_auth_methods,
        ['chatgpt', 'apikey'],
        '数组字段 preferred_auth_methods 必须保留（旧实现会丢弃）'
      );
      assert.strictEqual(after.model, 'gpt-5', '顶级字符串字段必须保留');
      assert.strictEqual(after.hide_agent_reasoning, true, '布尔字段必须保留');
      assert.strictEqual(after.notify_interval, 5, '数值字段必须保留');

      // 原有 provider 不得丢失
      assert.ok(after.model_providers.openai, '原有 model_providers.openai 必须保留');
      assert.deepStrictEqual(
        [...Object.keys(after.model_providers.openai.env || {}), ...Object.values(after.model_providers.openai.env || {})],
        ['OPENAI_API_KEY', 'sk-xxx'],
        'provider 内嵌套 env 对象必须保留（旧实现会丢弃）'
      );

      // mcp_servers 整个嵌套 table 不得丢失
      assert.ok(after.mcp_servers && after.mcp_servers.filesystem, 'mcp_servers.filesystem 必须保留');
      assert.deepStrictEqual(
        after.mcp_servers.filesystem.args,
        ['-y', '@modelcontextprotocol/server-filesystem'],
        'mcp_servers 内数组字段必须保留（旧实现会丢弃整个 section）'
      );

      // 3) 落盘内容也应包含这些字段（防止 readConfig 容错掩盖 writeConfig 问题）
      const onDisk = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8');
      assert.ok(onDisk.includes('preferred_auth_methods'), '落盘 config.toml 应含 preferred_auth_methods');
      assert.ok(onDisk.includes('mcp_servers.filesystem'), '落盘 config.toml 应含 mcp_servers.filesystem');
      assert.ok(onDisk.includes('cc-proxy'), '落盘 config.toml 应含 cc-proxy');
    } finally {
      childProcess.execFileSync = originalExec;
    }
  });

  console.log('codex-config-preserve.test.js passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
