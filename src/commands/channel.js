// 渠道命令行管理
const chalk = require('chalk');
const inquirer = require('inquirer');
const { loadConfig } = require('../config/loader');

const CHANNEL_TYPES = ['claude', 'codex', 'gemini'];

function getChannelServices(cliType) {
  if (cliType === 'claude') {
    const {
      getAllChannels,
      createChannel,
      updateChannel,
      deleteChannel,
      applyChannelToSettings,
      getCurrentChannel
    } = require('../server/services/channels');
    return {
      getAllChannels,
      createChannel,
      updateChannel,
      deleteChannel,
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
      createChannel,
      updateChannel,
      deleteChannel,
      applyChannelToSettings,
      getCurrentChannel
    } = require('../server/services/codex-channels');
    return {
      getAllChannels: () => {
        const result = getChannels();
        return Array.isArray(result?.channels) ? result.channels : [];
      },
      createChannel,
      updateChannel,
      deleteChannel,
      applyChannelToSettings,
      getCurrentChannel
    };
  }

  if (cliType === 'gemini') {
    const {
      getChannels,
      createChannel,
      updateChannel,
      deleteChannel,
      writeGeminiConfigForSingleChannel,
      getCurrentChannel
    } = require('../server/services/gemini-channels');
    return {
      getAllChannels: () => {
        const result = getChannels();
        return Array.isArray(result?.channels) ? result.channels : [];
      },
      createChannel,
      updateChannel,
      deleteChannel,
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
  console.log('  ct channel add [claude|codex|gemini]');
  console.log('  ct channel switch [claude|codex|gemini] [渠道ID或名称]');
  console.log('  ct channel use [claude|codex|gemini] [渠道ID或名称]\n');
  console.log('  ct channel delete [claude|codex|gemini] [渠道ID或名称]');
  console.log('  ct channel remove [claude|codex|gemini] [渠道ID或名称]\n');
  console.log(chalk.gray('说明: switch/use 会写入目标渠道配置，并只启用该渠道。'));
  console.log(chalk.gray('      add/delete/switch/use 不传类型时，会先选择 claude/codex/gemini。'));
  console.log(chalk.gray('      delete/remove 会二次确认后再删除渠道。\n'));
}

async function handleChannelCommand(args = []) {
  const action = args[0];

  if (!action || action === '--help' || action === '-h') {
    showChannelHelp();
    return;
  }

  const normalizedAction = action === 'remove' || action === 'rm'
    ? 'delete'
    : action;

  if (!['list', 'status', 'add', 'switch', 'use', 'delete'].includes(normalizedAction)) {
    console.log(chalk.red(`\n❌ 未知渠道命令: ${action}\n`));
    showChannelHelp();
    return;
  }

  const hasExplicitType = CHANNEL_TYPES.includes(args[1]);
  const shouldPromptCliType = ['add', 'delete', 'switch', 'use'].includes(normalizedAction) &&
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

  if (normalizedAction === 'list' || normalizedAction === 'status') {
    await listChannels(cliType, services);
    return;
  }

  if (normalizedAction === 'add') {
    if (args[1] && !hasExplicitType) {
      console.log(chalk.red(`\n❌ 不支持的 CLI 类型: ${args[1]}\n`));
      showChannelHelp();
      return;
    }
    await addChannel(cliType, services);
    return;
  }

  if (normalizedAction === 'delete') {
    await deleteChannel(cliType, services, selector);
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

async function addChannel(cliType, services) {
  if (typeof services.createChannel !== 'function') {
    console.log(chalk.red(`\n❌ ${cliType} 暂不支持添加渠道\n`));
    return;
  }

  const answers = await promptChannelFields(cliType);
  let channel;

  if (cliType === 'claude') {
    channel = services.createChannel(
      answers.name.trim(),
      answers.baseUrl.trim(),
      answers.apiKey.trim(),
      answers.websiteUrl.trim() || undefined
    );
  } else if (cliType === 'codex') {
    channel = services.createChannel(
      answers.name.trim(),
      answers.providerKey.trim() || generateProviderKey(answers.name),
      answers.baseUrl.trim(),
      answers.apiKey.trim(),
      answers.wireApi.trim() || 'responses',
      { websiteUrl: answers.websiteUrl.trim() || undefined }
    );
  } else if (cliType === 'gemini') {
    channel = services.createChannel(
      answers.name.trim(),
      answers.baseUrl.trim(),
      answers.apiKey.trim(),
      answers.model.trim() || 'gemini-2.5-pro',
      { websiteUrl: answers.websiteUrl.trim() || undefined }
    );
  }

  broadcastSchedulerSnapshot(cliType);

  console.log(chalk.green(`\n✅ 已添加 ${cliType} 渠道: ${channel.name}\n`));
  console.log(chalk.gray(`   渠道 ID: ${channel.id}`));
  console.log(chalk.gray('   可使用 ct channel switch 选择并写入该渠道。\n'));
}

async function deleteChannel(cliType, services, selector) {
  if (typeof services.deleteChannel !== 'function') {
    console.log(chalk.red(`\n❌ ${cliType} 暂不支持删除渠道\n`));
    return;
  }

  const channels = services.getAllChannels();
  if (!channels.length) {
    console.log(chalk.yellow(`\n暂无 ${cliType} 渠道可删除。\n`));
    return;
  }

  const target = selector
    ? findChannel(channels, selector)
    : await promptSelectChannel(cliType, channels, services.getCurrentChannel(), '删除');

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

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: `确认删除 ${cliType} 渠道「${target.name}」吗？`,
      default: false
    }
  ]);

  if (!confirmed) {
    console.log(chalk.gray('\n已取消删除。\n'));
    return;
  }

  await services.deleteChannel(target.id);
  broadcastSchedulerSnapshot(cliType);

  console.log(chalk.green(`\n✅ 已删除 ${cliType} 渠道: ${target.name}\n`));
}

async function switchChannel(cliType, services, selector) {
  const channels = services.getAllChannels();

  if (!channels.length) {
    console.log(chalk.yellow(`\n暂无 ${cliType} 渠道。请先通过 Web UI 或 ct 交互菜单添加渠道。\n`));
    return;
  }

  const target = selector
    ? findChannel(channels, selector)
    : await promptSelectChannel(cliType, channels, services.getCurrentChannel(), '切换');

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

async function promptSelectChannel(cliType, channels, currentChannel, actionLabel = '切换') {
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
      message: `请选择要${actionLabel}的 ${cliType} 渠道:`,
      pageSize: 15,
      choices
    }
  ]);

  return channels.find((channel) => channel.id === channelId) || null;
}

async function promptChannelFields(cliType) {
  const questions = [
    {
      type: 'input',
      name: 'name',
      message: '渠道名称:',
      validate: (input) => input.trim() ? true : '渠道名称不能为空'
    }
  ];

  if (cliType === 'codex') {
    questions.push({
      type: 'input',
      name: 'providerKey',
      message: 'Provider Key（直接回车按名称生成）:',
      default: (answers) => generateProviderKey(answers.name)
    });
  }

  questions.push(
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Base URL:',
      validate: validateHttpUrl
    },
    {
      type: 'input',
      name: 'apiKey',
      message: 'API Key:',
      validate: (input) => input.trim() ? true : 'API Key 不能为空'
    }
  );

  if (cliType === 'codex') {
    questions.push({
      type: 'input',
      name: 'wireApi',
      message: 'Wire API:',
      default: 'responses',
      validate: (input) => input.trim() ? true : 'Wire API 不能为空'
    });
  }

  if (cliType === 'gemini') {
    questions.push({
      type: 'input',
      name: 'model',
      message: '模型名称:',
      default: 'gemini-2.5-pro',
      validate: (input) => input.trim() ? true : '模型名称不能为空'
    });
  }

  questions.push({
    type: 'input',
    name: 'websiteUrl',
    message: '网站地址（可选，直接回车跳过）:',
    default: ''
  });

  return inquirer.prompt(questions);
}

function validateHttpUrl(input) {
  const value = input.trim();
  if (!value) {
    return 'Base URL 不能为空';
  }
  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return 'Base URL 必须以 http:// 或 https:// 开头';
  }
  return true;
}

function generateProviderKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    || `provider-${Date.now()}`;
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
  addChannel,
  deleteChannel,
  switchChannel,
  promptSelectCliType,
  promptSelectChannel,
  promptChannelFields
};
