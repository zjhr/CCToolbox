// 渠道命令行管理
const chalk = require('chalk');
const inquirer = require('inquirer');
const { loadConfig } = require('../config/loader');

const CHANNEL_TYPES = ['claude', 'codex', 'gemini'];

function getChannelServices(cliType) {
  if (cliType === 'claude') {
    const {
      getAllChannels,
      updateChannel,
      applyChannelToSettings,
      getCurrentChannel
    } = require('../server/services/channels');
    return {
      getAllChannels,
      updateChannel,
      applyChannelToSettings,
      getCurrentChannel: () => {
        const result = getCurrentChannel();
        return result?.channel || null;
      }
    };
  }

  if (cliType === 'codex') {
    const {
      getChannels,
      updateChannel,
      applyChannelToSettings,
      getCurrentChannel
    } = require('../server/services/codex-channels');
    return {
      getAllChannels: () => {
        const result = getChannels();
        return Array.isArray(result?.channels) ? result.channels : [];
      },
      updateChannel,
      applyChannelToSettings,
      getCurrentChannel
    };
  }

  if (cliType === 'gemini') {
    const {
      getChannels,
      updateChannel,
      writeGeminiConfigForSingleChannel,
      getCurrentChannel
    } = require('../server/services/gemini-channels');
    return {
      getAllChannels: () => {
        const result = getChannels();
        return Array.isArray(result?.channels) ? result.channels : [];
      },
      updateChannel,
      applyChannelToSettings: writeGeminiConfigForSingleChannel,
      getCurrentChannel
    };
  }

  return null;
}

function resolveCliType(rawType) {
  if (rawType && CHANNEL_TYPES.includes(rawType)) {
    return rawType;
  }
  const config = loadConfig();
  return config.currentCliType || 'claude';
}

function findChannel(channels, selector) {
  if (!selector) return null;
  const normalizedSelector = String(selector).trim().toLowerCase();
  return channels.find((channel) => {
    const id = String(channel.id || '').toLowerCase();
    const name = String(channel.name || '').toLowerCase();
    return id === normalizedSelector || name === normalizedSelector;
  }) || null;
}

function formatChannelLine(channel, currentChannel) {
  const enabled = channel.enabled !== false;
  const isCurrent = currentChannel && channel.id === currentChannel.id;
  const status = enabled ? chalk.green('启用') : chalk.gray('停用');
  const marker = isCurrent ? chalk.cyan('当前') : '    ';
  const parts = [
    chalk.bold(channel.name),
    chalk.gray(channel.id),
    status,
    marker
  ];

  if (channel.weight) {
    parts.push(chalk.gray(`权重 ${channel.weight}`));
  }
  if (channel.maxConcurrency) {
    parts.push(chalk.gray(`并发 ${channel.maxConcurrency}`));
  }

  return `  ${parts.join('  ')}`;
}

function showChannelHelp() {
  console.log(chalk.cyan.bold('\n渠道命令用法\n'));
  console.log('  ct channel list [claude|codex|gemini]');
  console.log('  ct channel status [claude|codex|gemini]');
  console.log('  ct channel switch [claude|codex|gemini] [渠道ID或名称]');
  console.log('  ct channel use [claude|codex|gemini] [渠道ID或名称]\n');
  console.log(chalk.gray('说明: switch/use 会写入目标渠道配置，并只启用该渠道。'));
  console.log(chalk.gray('      switch/use 不传类型和渠道时，会先选择 claude/codex/gemini。\n'));
}

async function handleChannelCommand(args = []) {
  const action = args[0];

  if (!action || action === '--help' || action === '-h') {
    showChannelHelp();
    return;
  }

  if (!['list', 'status', 'switch', 'use'].includes(action)) {
    console.log(chalk.red(`\n❌ 未知渠道命令: ${action}\n`));
    showChannelHelp();
    return;
  }

  const hasExplicitType = CHANNEL_TYPES.includes(args[1]);
  const shouldPromptCliType = (action === 'switch' || action === 'use') &&
    !hasExplicitType &&
    !args[1];
  const cliType = shouldPromptCliType
    ? await promptSelectCliType()
    : resolveCliType(hasExplicitType ? args[1] : null);
  const selector = hasExplicitType ? args[2] : args[1];
  const services = getChannelServices(cliType);

  if (!services) {
    console.log(chalk.red(`\n❌ 当前 CLI 类型 (${cliType}) 暂不支持渠道命令\n`));
    return;
  }

  if (action === 'list' || action === 'status') {
    await listChannels(cliType, services);
    return;
  }

  await switchChannel(cliType, services, selector);
}

async function promptSelectCliType() {
  const { cliType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'cliType',
      message: '请选择要切换渠道的 CLI 类型:',
      choices: [
        { name: 'Claude Code', value: 'claude' },
        { name: 'Codex', value: 'codex' },
        { name: 'Gemini', value: 'gemini' }
      ]
    }
  ]);

  return cliType;
}

async function listChannels(cliType, services) {
  const channels = services.getAllChannels();
  const currentChannel = services.getCurrentChannel();

  console.log(chalk.cyan.bold(`\n${cliType.toUpperCase()} 渠道列表\n`));

  if (!channels.length) {
    console.log(chalk.yellow('  暂无渠道。请先通过 Web UI 或 ct 交互菜单添加渠道。\n'));
    return;
  }

  channels.forEach((channel) => {
    console.log(formatChannelLine(channel, currentChannel));
  });
  console.log('');
}

async function switchChannel(cliType, services, selector) {
  const channels = services.getAllChannels();

  if (!channels.length) {
    console.log(chalk.yellow(`\n暂无 ${cliType} 渠道。请先通过 Web UI 或 ct 交互菜单添加渠道。\n`));
    return;
  }

  const target = selector
    ? findChannel(channels, selector)
    : await promptSelectChannel(cliType, channels, services.getCurrentChannel());

  if (!target) {
    console.log(chalk.red(`\n❌ 未找到 ${cliType} 渠道: ${selector}\n`));
    if (channels.length) {
      console.log(chalk.gray('可用渠道:'));
      channels.forEach((channel) => {
        console.log(chalk.gray(`  ${channel.name}  ${channel.id}`));
      });
      console.log('');
    }
    return;
  }

  const appliedChannel = await services.applyChannelToSettings(target.id);

  for (const channel of channels) {
    const shouldEnable = channel.id === target.id;
    const currentEnabled = channel.enabled !== false;
    if (shouldEnable !== currentEnabled) {
      await services.updateChannel(channel.id, { enabled: shouldEnable });
    }
  }

  broadcastSchedulerSnapshot(cliType);

  console.log(chalk.green(`\n✅ 已切换 ${cliType} 渠道: ${appliedChannel.name}\n`));
  console.log(chalk.gray(`   渠道 ID: ${appliedChannel.id}`));
  console.log(chalk.gray('   已写入配置，并停用同类型其他渠道。\n'));
}

async function promptSelectChannel(cliType, channels, currentChannel) {
  const choices = channels.map((channel) => {
    const detailParts = [];
    if (channel.enabled === false) {
      detailParts.push('停用');
    } else {
      detailParts.push('启用');
    }
    if (currentChannel && channel.id === currentChannel.id) {
      detailParts.push('当前');
    }
    if (channel.weight) {
      detailParts.push(`权重 ${channel.weight}`);
    }
    if (channel.maxConcurrency) {
      detailParts.push(`并发 ${channel.maxConcurrency}`);
    }

    return {
      name: `${channel.name}${chalk.gray(` (${detailParts.join(' | ')})`)}`,
      value: channel.id,
      short: channel.name
    };
  });

  const { channelId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'channelId',
      message: `请选择要切换的 ${cliType} 渠道:`,
      pageSize: 15,
      choices
    }
  ]);

  return channels.find((channel) => channel.id === channelId) || null;
}

function broadcastSchedulerSnapshot(source = 'claude') {
  try {
    const { getSchedulerState } = require('../server/services/channel-scheduler');
    const { broadcastSchedulerState } = require('../server/websocket-server');
    broadcastSchedulerState(source, getSchedulerState(source));
  } catch (err) {
    // 服务未启动时无需广播，CLI 切换结果仍然有效。
  }
}

module.exports = {
  handleChannelCommand,
  getChannelServices,
  findChannel,
  switchChannel,
  promptSelectCliType,
  promptSelectChannel
};
