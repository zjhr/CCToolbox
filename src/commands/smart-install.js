// 智能安装命令
const chalk = require('chalk');
const inquirer = require('inquirer');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ora = require('ora');

// CLI 工具配置映射
const CLI_CONFIGS = {
  claude: {
    name: 'Claude Code',
    packageName: '@anthropic-ai/claude-code',
    binaryName: 'claude',
    configPath: path.join(os.homedir(), '.claude', 'settings.json'),
    ideConfigPath: path.join(os.homedir(), '.claude', 'ide', 'settings.json'),
    channelServicePath: '../server/services/channels',
    envVars: {
      apiKey: 'ANTHROPIC_API_KEY',
      baseUrl: 'ANTHROPIC_BASE_URL'
    }
  },
  codex: {
    name: 'Codex',
    packageName: '@openai/codex',
    binaryName: 'codex',
    configPath: path.join(os.homedir(), '.codex', 'config.toml'),
    envPath: path.join(os.homedir(), '.codex', '.env'),
    channelServicePath: '../server/services/codex-channels',
    envVars: {
      apiKey: 'OPENAI_API_KEY',
      baseUrl: 'OPENAI_BASE_URL'
    }
  },
  gemini: {
    name: 'Gemini',
    packageName: '@google/gemini-cli',
    binaryName: 'gemini',
    configPath: path.join(os.homedir(), '.gemini', 'settings.json'),
    envPath: path.join(os.homedir(), '.gemini', '.env'),
    channelServicePath: '../server/services/gemini-channels',
    envVars: {
      apiKey: 'GEMINI_API_KEY',
      baseUrl: 'GOOGLE_GEMINI_BASE_URL'
    }
  }
};

/**
 * 检查 CLI 工具是否已安装
 */
function checkCliInstalled(binaryName) {
  try {
    execSync(`which ${binaryName}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查 npm 包版本
 */
function getInstalledVersion(packageName) {
  try {
    const result = execSync(`npm list -g ${packageName} --depth=0`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const match = result.match(new RegExp(`${packageName}@([\\d\\.]+)`));
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 安装 CLI 工具
 */
async function installCli(packageName, cliName) {
  const spinner = ora(`正在安装 ${cliName}...`).start();

  try {
    // 先尝试不使用 sudo
    try {
      execSync(`npm install -g ${packageName}`, {
        stdio: 'pipe',
        encoding: 'utf8'
      });
      spinner.succeed(`${cliName} 安装成功`);
      return true;
    } catch (err) {
      // 如果失败且错误信息包含权限问题
      if (err.message.includes('EACCES') || err.message.includes('permission')) {
        spinner.info(`需要管理员权限安装 ${cliName}`);

        // 询问用户是否使用 sudo
        const { useSudo } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'useSudo',
            message: `是否使用 sudo 安装？(需要输入密码)`,
            default: true
          }
        ]);

        if (useSudo) {
          spinner.start(`正在使用 sudo 安装 ${cliName}...`);
          execSync(`sudo npm install -g ${packageName}`, {
            stdio: 'inherit'
          });
          spinner.succeed(`${cliName} 安装成功`);
          return true;
        } else {
          spinner.warn('已取消安装');
          console.log(chalk.yellow('\n💡 您可以手动安装：'));
          console.log(chalk.gray(`   npm install -g ${packageName}`));
          console.log(chalk.gray(`   或者使用 sudo: sudo npm install -g ${packageName}\n`));
          return false;
        }
      } else {
        throw err;
      }
    }
  } catch (err) {
    spinner.fail(`${cliName} 安装失败`);
    console.error(chalk.red(`\n❌ 安装错误: ${err.message}\n`));

    console.log(chalk.yellow('💡 请尝试手动安装：'));
    console.log(chalk.gray(`   npm install -g ${packageName}\n`));

    console.log(chalk.yellow('💡 如果仍然失败，可能的原因：'));
    console.log(chalk.gray('   1. 网络连接问题（尝试切换 npm 源）'));
    console.log(chalk.gray('   2. npm 版本过低（尝试更新 npm）'));
    console.log(chalk.gray('   3. 包名可能已更新（查看官方文档）\n'));

    return false;
  }
}

/**
 * 备份配置文件
 */
function backupConfig(configPath) {
  if (fs.existsSync(configPath)) {
    const backupPath = `${configPath}.backup-${Date.now()}`;
    fs.copyFileSync(configPath, backupPath);
    return backupPath;
  }
  return null;
}

/**
 * 生成 Claude Code 配置文件
 */
function generateClaudeConfig(baseUrl, apiKey, configPath) {
  const config = {
    apiKeyHelper: `echo '${apiKey}'`,
    env: {
      ANTHROPIC_API_KEY: apiKey,
      ANTHROPIC_BASE_URL: baseUrl
    },
    permissions: {
      allow: [],
      deny: []
    }
  };

  // 如果已有配置，保留 hooks 等其他字段
  if (fs.existsSync(configPath)) {
    try {
      const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (existingConfig.hooks) {
        config.hooks = existingConfig.hooks;
      }
      if (existingConfig.alwaysThinkingEnabled !== undefined) {
        config.alwaysThinkingEnabled = existingConfig.alwaysThinkingEnabled;
      }
    } catch (err) {
      console.log(chalk.yellow('⚠️  读取现有配置失败，将创建新配置'));
    }
  }

  return config;
}

/**
 * 生成 Codex .env 文件内容
 */
function generateCodexEnv(providerName, apiKey) {
  const envVarName = `${providerName.toUpperCase()}_API_KEY`;
  return `# Codex CLI Environment Variables
# Generated by CCToolbox

${envVarName}=${apiKey}
`;
}

/**
 * 更新 Codex config.toml 文件，添加 provider 配置
 */
function updateCodexConfig(configPath, providerName, baseUrl) {
  const toml = require('@iarna/toml');
  let config = {};

  // 读取现有配置
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      config = toml.parse(content);
    } catch (err) {
      console.log(chalk.yellow('⚠️  读取现有配置失败，将创建新配置'));
    }
  }

  // 设置当前 provider
  config.model_provider = providerName;

  // 添加 provider 配置
  if (!config.model_providers) {
    config.model_providers = {};
  }

  config.model_providers[providerName] = {
    name: providerName,
    base_url: baseUrl,
    wire_api: 'responses',
    env_key: `${providerName.toUpperCase()}_API_KEY`,
    requires_openai_auth: true
  };

  // 写入配置
  const tomlContent = toml.stringify(config);
  fs.writeFileSync(configPath, tomlContent, 'utf8');
}

/**
 * 生成 Gemini .env 文件内容
 */
function generateGeminiEnv(baseUrl, apiKey) {
  return `# Gemini CLI Environment Variables
# Generated by CCToolbox

GOOGLE_GEMINI_BASE_URL=${baseUrl}
GEMINI_API_KEY=${apiKey}
GEMINI_MODEL=gemini-2.0-flash-exp
`;
}

/**
 * 写入配置文件
 */
function writeConfig(configPath, content, isToml = false) {
  const dir = path.dirname(configPath);

  // 确保目录存在
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 写入配置
  if (isToml) {
    fs.writeFileSync(configPath, content, 'utf8');
  } else {
    fs.writeFileSync(configPath, JSON.stringify(content, null, 2), 'utf8');
  }

  // 设置文件权限为 600 (仅用户可读写)
  try {
    fs.chmodSync(configPath, 0o600);
  } catch (err) {
    // Windows 上可能失败，忽略
  }
}

/**
 * 添加渠道到 CCToolbox
 */
async function addChannelToCodingTool(cliType, name, baseUrl, apiKey, providerName = null) {
  try {
    const config = CLI_CONFIGS[cliType];
    const { createChannel } = require(config.channelServicePath);

    if (cliType === 'claude') {
      // Claude 使用对象参数
      const channelData = {
        name: name,
        baseUrl: baseUrl,
        apiKey: apiKey,
        enabled: true,
        weight: 1,
        maxConcurrent: 3
      };
      await createChannel(channelData);
    } else if (cliType === 'codex') {
      // Codex 使用位置参数: createChannel(name, providerKey, baseUrl, apiKey, wireApi, extraConfig)
      if (!providerName) {
        throw new Error('Codex 需要 providerName 参数');
      }
      const extraConfig = {
        enabled: true,
        weight: 1,
        maxConcurrency: 3
      };
      createChannel(name, providerName, baseUrl, apiKey, 'responses', extraConfig);
    } else if (cliType === 'gemini') {
      // Gemini 使用对象参数
      const channelData = {
        name: name,
        baseUrl: baseUrl,
        apiKey: apiKey,
        enabled: true,
        weight: 1,
        maxConcurrency: 3
      };
      await createChannel(channelData);
    }

    return true;
  } catch (err) {
    console.error(chalk.red(`\n❌ 添加渠道失败: ${err.message}`));
    console.error(chalk.gray(`详细错误: ${err.stack}`));
    return false;
  }
}

/**
 * 验证配置
 */
async function validateConfig(cliType, binaryName) {
  const spinner = ora('正在验证配置...').start();

  try {
    // 检查二进制文件是否可执行
    execSync(`${binaryName} --version`, {
      stdio: 'pipe',
      timeout: 5000
    });

    spinner.succeed('配置验证成功');
    return true;
  } catch (err) {
    spinner.warn('配置验证失败（可能需要重启终端）');
    return false;
  }
}

/**
 * 智能安装主函数
 */
async function handleSmartInstall(preSelectedCliType = null) {
  console.clear();
  console.log(chalk.bold.cyan('\n╔═══════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║          🚀 智能安装 CLI 工具             ║'));
  console.log(chalk.bold.cyan('╚═══════════════════════════════════════════════╝\n'));

  console.log(chalk.gray('📝 只需提供 Base URL 和 API Key，我们会帮您：'));
  console.log(chalk.gray('   1. 检测并安装 CLI 工具'));
  console.log(chalk.gray('   2. 自动生成配置文件'));
  console.log(chalk.gray('   3. 添加渠道到管理系统'));
  console.log(chalk.gray('   4. 验证配置是否成功\n'));

  // 第一步：选择 CLI 类型（如果没有预选）
  let cliType = preSelectedCliType;

  if (!cliType) {
    const result = await inquirer.prompt([
      {
        type: 'list',
        name: 'cliType',
        message: '选择要安装的 CLI 类型:',
        choices: [
          { name: chalk.cyan('Claude Code'), value: 'claude' },
          { name: chalk.green('Codex'), value: 'codex' },
          { name: chalk.magenta('Gemini'), value: 'gemini' }
        ]
      }
    ]);
    cliType = result.cliType;
  } else {
    // 验证预选的类型是否有效
    if (!CLI_CONFIGS[cliType]) {
      console.log(chalk.red(`\n❌ 错误: 不支持的 CLI 类型 "${cliType}"\n`));
      console.log(chalk.gray('支持的类型: claude, codex, gemini\n'));
      return;
    }
    console.log(chalk.cyan(`✓ 已选择: ${CLI_CONFIGS[cliType].name}\n`));
  }

  const config = CLI_CONFIGS[cliType];
  console.log(chalk.bold.yellow(`\n📦 准备安装: ${config.name}\n`));

  // 第二步：输入配置信息
  const prompts = [
    {
      type: 'input',
      name: 'channelName',
      message: '渠道名称:',
      default: `${config.name} Default`,
      validate: (input) => {
        if (!input.trim()) {
          return '渠道名称不能为空';
        }
        return true;
      }
    }
  ];

  // Codex 需要额外的 Provider 配置
  if (cliType === 'codex') {
    prompts.push({
      type: 'input',
      name: 'providerName',
      message: 'Provider 名称:',
      default: 'codingtool',
      validate: (input) => {
        if (!input.trim()) {
          return 'Provider 名称不能为空';
        }
        if (!/^[a-z0-9_-]+$/.test(input)) {
          return 'Provider 名称只能包含小写字母、数字、下划线和连字符';
        }
        return true;
      }
    });
  }

  prompts.push(
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Base URL:',
      validate: (input) => {
        if (!input.trim()) {
          return 'Base URL 不能为空';
        }
        if (!input.startsWith('http://') && !input.startsWith('https://')) {
          return 'Base URL 必须以 http:// 或 https:// 开头';
        }
        return true;
      }
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'API Key:',
      mask: '*',
      validate: (input) => {
        if (!input.trim()) {
          return 'API Key 不能为空';
        }
        return true;
      }
    }
  );

  const answers = await inquirer.prompt(prompts);

  console.log(chalk.bold.cyan('\n⏳ 开始安装流程...\n'));

  // 第三步：检测 CLI 工具
  const spinner1 = ora(`正在检测 ${config.name} 安装状态...`).start();
  const isInstalled = checkCliInstalled(config.binaryName);

  if (isInstalled) {
    const version = getInstalledVersion(config.packageName);
    spinner1.succeed(`${config.name} 已安装${version ? ` (v${version})` : ''}`);
  } else {
    spinner1.info(`${config.name} 未安装`);

    // 询问是否安装
    const { shouldInstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldInstall',
        message: `是否自动安装 ${config.name}？`,
        default: true
      }
    ]);

    if (shouldInstall) {
      const installed = await installCli(config.packageName, config.name);
      if (!installed) {
        console.log(chalk.red('\n❌ 安装失败，无法继续\n'));
        return;
      }
    } else {
      console.log(chalk.yellow(`\n⚠️  请先手动安装 ${config.name}：`));
      console.log(chalk.gray(`   npm install -g ${config.packageName}\n`));
      return;
    }
  }

  // 第四步：生成配置文件
  const spinner2 = ora('正在生成配置文件...').start();
  let backupPath = null;

  try {
    // 备份现有配置
    backupPath = backupConfig(config.configPath);
    if (backupPath) {
      spinner2.info(`已备份现有配置: ${path.basename(backupPath)}`);
    }

    // 生成新配置
    if (cliType === 'claude') {
      const configContent = generateClaudeConfig(answers.baseUrl, answers.apiKey, config.configPath);
      writeConfig(config.configPath, configContent, false);
      spinner2.succeed(`配置文件已创建: ${config.configPath}`);

      // 同时更新 IDE 配置（如果存在）
      if (fs.existsSync(config.ideConfigPath)) {
        writeConfig(config.ideConfigPath, configContent, false);
        spinner2.info(`已更新 IDE 配置: ${config.ideConfigPath}`);
      }
    } else if (cliType === 'codex') {
      // Codex 需要更新 config.toml 和 .env 文件
      const providerName = answers.providerName;

      // 1. 更新 config.toml，添加 provider 配置
      updateCodexConfig(config.configPath, providerName, answers.baseUrl);
      spinner2.succeed(`Provider 配置已添加: ${config.configPath}`);

      // 2. 创建 .env 文件，存储 API Key
      const envContent = generateCodexEnv(providerName, answers.apiKey);
      const envDir = path.dirname(config.envPath);

      if (!fs.existsSync(envDir)) {
        fs.mkdirSync(envDir, { recursive: true });
      }

      fs.writeFileSync(config.envPath, envContent, 'utf8');
      try {
        fs.chmodSync(config.envPath, 0o600);
      } catch (err) {
        // Windows 上可能失败，忽略
      }

      spinner2.succeed(`环境配置已创建: ${config.envPath}`);
      spinner2.info(`提示: Provider "${providerName}" 已设置为默认 provider`);
    } else if (cliType === 'gemini') {
      // Gemini 使用 .env 文件存储 API 配置
      const envContent = generateGeminiEnv(answers.baseUrl, answers.apiKey);
      const envDir = path.dirname(config.envPath);

      if (!fs.existsSync(envDir)) {
        fs.mkdirSync(envDir, { recursive: true });
      }

      fs.writeFileSync(config.envPath, envContent, 'utf8');
      try {
        fs.chmodSync(config.envPath, 0o600);
      } catch (err) {
        // Windows 上可能失败，忽略
      }

      spinner2.succeed(`环境配置已创建: ${config.envPath}`);
      spinner2.info('提示: Gemini 会自动读取 .env 文件中的配置');
    }
  } catch (err) {
    spinner2.fail('配置文件生成失败');
    console.error(chalk.red(`\n❌ 错误: ${err.message}\n`));
    return;
  }

  // 第五步：添加渠道到 CCToolbox
  const spinner3 = ora('正在添加渠道到 CCToolbox...').start();

  const channelAdded = await addChannelToCodingTool(
    cliType,
    answers.channelName,
    answers.baseUrl,
    answers.apiKey,
    cliType === 'codex' ? answers.providerName : null
  );

  if (channelAdded) {
    spinner3.succeed(`渠道已添加: ${answers.channelName}`);
  } else {
    spinner3.warn('渠道添加失败（您可以稍后在 Web UI 中手动添加）');
  }

  // 第六步：验证配置
  await validateConfig(cliType, config.binaryName);

  // 完成
  console.log(chalk.bold.green('\n🎉 安装完成！\n'));

  console.log(chalk.yellow('💡 使用说明:'));
  console.log(chalk.gray(`   1. 启动 ${config.name}: ${config.binaryName}`));
  console.log(chalk.gray('   2. 管理渠道: ct ui'));
  console.log(chalk.gray('   3. 查看状态: ct status'));
  console.log(chalk.gray(`   4. 配置文件位置: ${config.configPath}\n`));

  if (backupPath) {
    console.log(chalk.yellow(`📝 提示: 原配置已备份至 ${path.basename(backupPath)}\n`));
  }

  // 询问是否启动 Web UI
  const { startUI } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'startUI',
      message: '是否立即启动 Web UI 进行管理？',
      default: true
    }
  ]);

  if (startUI) {
    console.log(chalk.cyan('\n正在启动 Web UI...\n'));
    const { handleUI } = require('./ui');
    await handleUI();
  } else {
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: '按回车返回主菜单...'
      }
    ]);
  }
}

module.exports = {
  handleSmartInstall
};
