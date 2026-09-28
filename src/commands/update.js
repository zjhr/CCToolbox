const chalk = require('chalk');
const { spawn } = require('child_process');
const ora = require('ora');
const path = require('path');
const { checkForUpdates } = require('../utils/version-check');
const { checkGitUpdate } = require('../utils/git-version');

// 版本号相同时显示提交号，避免 Git 更新看起来像没有变化。
function formatGitVersion(result, side) {
  const version = side === 'current' ? result.current : result.latest;
  const commit = side === 'current' ? result.currentCommit : result.latestCommit;
  const hasCommitOnlyUpdate =
    result.current === result.latest &&
    result.currentCommit &&
    result.latestCommit &&
    result.currentCommit !== result.latestCommit;

  if (!version || !hasCommitOnlyUpdate) {
    return version || 'unknown';
  }

  return `${version} (${commit.slice(0, 7)})`;
}

/**
 * 处理更新命令
 */
async function handleUpdate() {
  console.log(chalk.cyan.bold('\n🔍 检查更新中...\n'));

  const spinner = ora('正在检查版本...').start();
  const rootDir = path.resolve(__dirname, '../..');
  const autoConfirm = process.argv.includes('--yes') || process.argv.includes('-y');

  try {
    const gitResult = await checkGitUpdate(rootDir);

    spinner.stop();

    if (gitResult.type === 'git') {
      if (gitResult.error) {
        console.log(chalk.yellow('⚠️  无法检查更新（Git 检查失败）'));
        console.log(chalk.gray(`   当前版本: ${gitResult.current || 'unknown'}\n`));
        return;
      }

      console.log(chalk.gray(`📦 当前版本: ${chalk.white.bold(formatGitVersion(gitResult, 'current'))}`));
      console.log(chalk.gray(`📦 最新版本: ${chalk.white.bold(formatGitVersion(gitResult, 'latest'))}\n`));

      if (!gitResult.hasUpdate) {
        console.log(chalk.green('✅ 已经是最新版本！\n'));
        return;
      }

      // 发现新版本
      console.log(chalk.green.bold('🎉 发现新版本！'));
      console.log(chalk.cyan(`   ${gitResult.current} → ${gitResult.latest}\n`));

      let confirm = autoConfirm;
      if (!autoConfirm) {
        const inquirer = require('inquirer');
        const answer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: '是否立即更新？',
            default: true
          }
        ]);
        confirm = answer.confirm;
      }

      if (!confirm) {
        console.log(chalk.yellow('\n❌ 已取消更新\n'));
        return;
      }

      // 执行更新
      console.log(chalk.cyan('\n⏳ 正在更新...\n'));

      await performGitUpdate(rootDir);
      return;
    }

    const result = await checkForUpdates();

    if (result.error) {
      console.log(chalk.yellow('⚠️  无法检查更新（网络连接失败）'));
      console.log(chalk.gray(`   当前版本: ${result.current}\n`));
      return;
    }

    console.log(chalk.gray(`📦 当前版本: ${chalk.white.bold(result.current)}`));
    console.log(chalk.gray(`📦 最新版本: ${chalk.white.bold(result.latest)}\n`));

    if (!result.hasUpdate) {
      console.log(chalk.green('✅ 已经是最新版本！\n'));
      return;
    }

    // 发现新版本
    console.log(chalk.green.bold('🎉 发现新版本！'));
    console.log(chalk.cyan(`   ${result.current} → ${result.latest}\n`));

    // 询问是否更新
    let confirm = autoConfirm;
    if (!autoConfirm) {
      const inquirer = require('inquirer');
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: '是否立即更新？',
          default: true
        }
      ]);
      confirm = answer.confirm;
    }

    if (!confirm) {
      console.log(chalk.yellow('\n❌ 已取消更新\n'));
      return;
    }

    // 执行更新
    console.log(chalk.cyan('\n⏳ 正在更新...\n'));

    await performNpmUpdate();

  } catch (err) {
    spinner.stop();
    console.error(chalk.red('\n❌ 检查更新失败:'), err.message);
    console.log();
  }
}

/**
 * 执行实际的更新操作
 */
function performNpmUpdate() {
  return new Promise((resolve, reject) => {
    const updateProcess = spawn('npm', ['install', '-g', 'cctoolbox@latest'], {
      stdio: 'inherit',
      shell: true
    });

    updateProcess.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green.bold('\n✅ 更新成功！\n'));
        console.log(chalk.cyan('💡 提示: 更新后可能需要重启终端或重新运行命令\n'));
        resolve();
      } else {
        console.log(chalk.red('\n❌ 更新失败'));
        console.log(chalk.yellow('💡 提示: 您可以尝试手动更新：'));
        console.log(chalk.gray('   $ npm install -g cctoolbox@latest\n'));
        reject(new Error('Update failed with code ' + code));
      }
    });

    updateProcess.on('error', (err) => {
      console.log(chalk.red('\n❌ 更新失败:'), err.message);
      console.log(chalk.yellow('💡 提示: 您可以尝试手动更新：'));
      console.log(chalk.gray('   $ npm install -g cctoolbox@latest\n'));
      reject(err);
    });
  });
}

/**
 * 执行 Git 更新操作
 */
function performGitUpdate(rootDir) {
  return new Promise((resolve, reject) => {
    const updateProcess = spawn('python3', ['update.py'], {
      stdio: 'inherit',
      cwd: rootDir
    });

    updateProcess.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green.bold('\n✅ 更新成功！\n'));
        resolve();
      } else {
        console.log(chalk.red('\n❌ 更新失败'));
        console.log(chalk.yellow('💡 提示: 您可以尝试手动更新：'));
        console.log(chalk.gray('   $ git pull origin main\n'));
        reject(new Error('Update failed with code ' + code));
      }
    });

    updateProcess.on('error', (err) => {
      console.log(chalk.red('\n❌ 更新失败:'), err.message);
      console.log(chalk.yellow('💡 提示: 您可以尝试手动更新：'));
      console.log(chalk.gray('   $ git pull origin main\n'));
      reject(err);
    });
  });
}

/**
 * 静默检查更新（不进行交互，仅返回结果）
 */
async function checkUpdateSilently() {
  try {
    const rootDir = path.resolve(__dirname, '../..');
    const gitResult = await checkGitUpdate(rootDir);
    if (gitResult.type === 'git') {
      return gitResult;
    }

    const result = await checkForUpdates();
    return {
      ...result,
      type: 'npm'
    };
  } catch (err) {
    return {
      hasUpdate: false,
      error: true
    };
  }
}

module.exports = {
  handleUpdate,
  checkUpdateSilently
};
