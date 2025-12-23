// 菜单显示
const inquirer = require('inquirer');
const chalk = require('chalk');
const packageInfo = require('../../package.json');

/**
 * 显示主菜单
 */
async function showMainMenu(config) {
  console.log(chalk.bold.cyan('\n╔═══════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan(`║    Vibe Coding 会话管理工具 v${packageInfo.version}          ║`));
  console.log(chalk.bold.cyan('╚═══════════════════════════════════════════════╝\n'));

  // 显示当前CLI类型
  const cliTypes = {
    claude: { name: 'Claude Code', color: 'cyan' },
    codex: { name: 'Codex', color: 'green' },
    gemini: { name: 'Gemini', color: 'magenta' }
  };
  const currentType = config.currentCliType || 'claude';
  const typeInfo = cliTypes[currentType];
  console.log(chalk[typeInfo.color](`当前类型: ${typeInfo.name}`));

  const projectName = config.currentProject
    ? config.currentProject.replace(/-/g, '/').substring(1)
    : '未设置';
  console.log(chalk.gray(`当前项目: ${projectName}`));

  // 显示当前渠道和代理状态（根据类型显示对应的渠道和代理）
  try {
    let getCurrentChannelFunc, getProxyStatusFunc;

    if (currentType === 'claude') {
      const { getCurrentChannel } = require('../server/services/channels');
      const { getProxyStatus } = require('../server/proxy-server');
      getCurrentChannelFunc = getCurrentChannel;
      getProxyStatusFunc = getProxyStatus;
    } else if (currentType === 'codex') {
      const { getActiveCodexChannel } = require('../server/services/codex-channels');
      const { getCodexProxyStatus } = require('../server/codex-proxy-server');
      getCurrentChannelFunc = getActiveCodexChannel;
      getProxyStatusFunc = getCodexProxyStatus;
    } else if (currentType === 'gemini') {
      const { getActiveGeminiChannel } = require('../server/services/gemini-channels');
      const { getGeminiProxyStatus } = require('../server/gemini-proxy-server');
      getCurrentChannelFunc = getActiveGeminiChannel;
      getProxyStatusFunc = getGeminiProxyStatus;
    }

    const currentChannel = getCurrentChannelFunc();
    const proxyStatus = getProxyStatusFunc();

    if (currentChannel) {
      console.log(chalk.gray(`当前渠道: ${currentChannel.name}`));
    }

    if (proxyStatus.running) {
      console.log(chalk.green(`动态切换: 已开启 (端口 ${proxyStatus.port})`));
    } else {
      console.log(chalk.gray('动态切换: 未开启'));
    }
  } catch (err) {
    // 忽略错误
  }

  console.log(chalk.gray('─'.repeat(50)));

  // 获取代理状态，用于显示动态切换的状态（根据当前类型）
  let proxyStatusText = '未开启';
  try {
    let proxyStatus;

    if (currentType === 'claude') {
      // 清除缓存确保获取最新状态
      delete require.cache[require.resolve('../server/proxy-server')];
      const { getProxyStatus } = require('../server/proxy-server');
      proxyStatus = getProxyStatus();
    } else if (currentType === 'codex') {
      delete require.cache[require.resolve('../server/codex-proxy-server')];
      const { getCodexProxyStatus } = require('../server/codex-proxy-server');
      proxyStatus = getCodexProxyStatus();
    } else if (currentType === 'gemini') {
      delete require.cache[require.resolve('../server/gemini-proxy-server')];
      const { getGeminiProxyStatus } = require('../server/gemini-proxy-server');
      proxyStatus = getGeminiProxyStatus();
    }

    if (proxyStatus && proxyStatus.running) {
      proxyStatusText = '已开启';
    }
  } catch (err) {
    // 忽略错误
    console.error('获取代理状态失败:', err.message);
  }

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '请选择操作:',
      pageSize: 17,
      choices: [
        { name: chalk.bold.yellow('切换 CLI 类型'), value: 'switch-cli-type' },
        new inquirer.Separator(chalk.gray('─'.repeat(14))),
        { name: chalk.bold.hex('#00D9FF')('🚀 智能安装'), value: 'smart-install' },
        { name: chalk.bold.hex('#00D9FF')('启动 Web UI'), value: 'ui' },
        new inquirer.Separator(chalk.gray('─'.repeat(14))),
        { name: chalk.cyan('列出最新对话'), value: 'list' },
        { name: chalk.green('搜索会话'), value: 'search' },
        { name: chalk.magenta('切换项目'), value: 'switch' },
        new inquirer.Separator(chalk.gray('─'.repeat(14))),
        { name: chalk.cyan('渠道管理'), value: 'switch-channel' },
        { name: chalk.cyan('查看调度状态'), value: 'channel-status' },
        { name: chalk.cyan(`是否开启动态切换 (${proxyStatusText})`), value: 'toggle-proxy' },
        { name: chalk.cyan('添加渠道'), value: 'add-channel' },
        new inquirer.Separator(chalk.gray('─'.repeat(14))),
        { name: chalk.magenta('配置端口'), value: 'port-config' },
        { name: chalk.yellow('恢复默认配置'), value: 'reset' },
        { name: chalk.gray('退出程序'), value: 'exit' },
      ],
    },
  ]);

  return action;
}

module.exports = {
  showMainMenu,
};
