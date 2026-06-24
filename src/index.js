#!/usr/bin/env node

/**
 * CC-CLI - Claude Code 会话管理工具
 * 主入口文件
 */

const { loadConfig } = require("./config/loader");
const { showMainMenu } = require("./ui/menu");
const { handleList } = require("./commands/list");
const { handleSearch } = require("./commands/search");
const { switchProject } = require("./commands/switch");
const { handleUI } = require("./commands/ui");
const {
  handleProxyStart,
  handleProxyStop,
  handleProxyStatus,
} = require("./commands/proxy");
const { resetConfig } = require("./reset-config");
const {
  handleChannelManagement,
  handleAddChannel,
  handleChannelStatus,
} = require("./commands/channels");
const { handleChannelCommand } = require("./commands/channel");
const { handleToggleProxy } = require("./commands/toggle-proxy");
const { handlePortConfig } = require("./commands/port-config");
const { handleSwitchCliType } = require("./commands/cli-type");
const { handleUpdate } = require("./commands/update");
const {
  handleStart,
  handleStop,
  handleRestart,
  handleStatus,
} = require("./commands/daemon");
const {
  handleProxyStart: proxyStart,
  handleProxyStop: proxyStop,
  handleProxyRestart,
  handleProxyStatus: proxyStatus,
} = require("./commands/proxy-control");
const { handleLogs } = require("./commands/logs");
const { handleStats, handleStatsExport } = require("./commands/stats");
const { handleDoctor } = require("./commands/doctor");
const { handleSmartInstall } = require("./commands/smart-install");
const { migrateIfNeeded } = require("./utils/app-path-manager");
const chalk = require("chalk");
const path = require("path");
const fs = require("fs");

// 读取版本号
function getVersion() {
  const packagePath = path.join(__dirname, "../package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  return packageJson.version;
}

// 显示帮助信息
function showHelp() {
  const version = getVersion();
  console.log(chalk.cyan.bold(`\nCCTOOLBOX v${version}`));
  console.log(
    chalk.gray(
      "Vibe Coding 增强工作助手 - 智能会话管理、动态渠道切换、全局搜索、实时监控\n"
    )
  );

  console.log(chalk.yellow("🚀 服务管理:"));
  console.log("  ct start                启动所有服务（后台运行）");
  console.log("  ct stop                 停止所有服务");
  console.log("  ct restart              重启所有服务");
  console.log("  ct status               查看服务状态\n");

  console.log(chalk.yellow("📱 UI 管理:"));
  console.log("  ct ui                   前台启动 Web UI（默认）");
  console.log("  ct ui start             后台启动 Web UI");
  console.log("  ct ui stop              停止 Web UI");
  console.log("  ct ui restart           重启 Web UI\n");

  console.log(chalk.yellow("🔌 代理管理:"));
  console.log("  ct claude start         启动 Claude 代理");
  console.log("  ct claude stop          停止 Claude 代理");
  console.log("  ct claude status        查看 Claude 代理状态");
  console.log("  ct codex start          启动 Codex 代理");
  console.log("  ct gemini start         启动 Gemini 代理");
  console.log(chalk.gray("  (codex/gemini 命令与 claude 类似)\n"));

  console.log(chalk.yellow("🔀 渠道管理:"));
  console.log("  ct channel list         查看当前 CLI 类型的渠道");
  console.log("  ct channel list codex   查看 Codex 渠道");
  console.log("  ct channel add          交互式选择 CLI 类型并添加渠道");
  console.log("  ct channel add codex    添加 Codex 渠道");
  console.log("  ct channel switch       交互式选择 CLI 类型和渠道");
  console.log("  ct channel switch codex 交互式切换 Codex 渠道");
  console.log("  ct channel switch codex <id|name>");
  console.log("  ct channel delete       交互式选择 CLI 类型并删除渠道");
  console.log("  ct channel delete codex <id|name>");
  console.log(chalk.gray("  (switch 会写入配置，并只启用目标渠道)\n"));

  console.log(chalk.yellow("📋 日志管理:"));
  console.log("  ct logs                 查看所有日志");
  console.log("  ct logs ui              查看 UI 日志");
  console.log("  ct logs claude          查看 Claude 日志");
  console.log("  ct logs --lines 100     查看最近 100 行");
  console.log("  ct logs --follow        实时跟踪日志");
  console.log("  ct logs --clear         清空日志\n");

  console.log(chalk.yellow("📊 统计信息:"));
  console.log("  ct stats                查看总体统计");
  console.log("  ct stats claude         查看 Claude 统计");
  console.log("  ct stats --today        查看今日统计");
  console.log("  ct stats export         导出统计数据\n");

  console.log(chalk.yellow("🛠️  其他命令:"));
  console.log("  ct install              智能安装 CLI 工具（显示选择菜单）");
  console.log(
    "  ct install <type>       直接安装指定类型 (claude/codex/gemini)"
  );
  console.log("  ct doctor               系统诊断");
  console.log("  ct update               检查并更新");
  console.log("  ct reset                重置配置");
  console.log("  ct --version, -v        显示版本");
  console.log("  ct --help, -h           显示帮助\n");

  console.log(chalk.yellow("💡 快速开始:"));
  console.log(chalk.gray("  $ ct start           # 后台启动服务（推荐）"));
  console.log(chalk.gray("  $ ct status          # 查看服务状态"));
  console.log(chalk.gray("  $ ct logs            # 查看实时日志"));
  console.log(chalk.gray("  $ ct stop            # 停止服务\n"));

  console.log(chalk.yellow("⭐ 开机自启（可选）:"));
  console.log(chalk.gray("  $ pm2 startup        # 启用开机自启"));
  console.log(chalk.gray("  $ pm2 save           # 保存配置"));
  console.log(chalk.gray("  $ pm2 unstartup      # 禁用开机自启\n"));

  console.log(chalk.yellow("更多信息:"));
  console.log(chalk.gray("  官网: https://github.com/zjhr/coding-tool"));
  console.log(chalk.gray("  文档: 运行 ct start 后在 Web UI 右上角点击帮助"));
  console.log(
    chalk.gray("  问题: https://github.com/zjhr/coding-tool/issues\n")
  );
}

// 全局错误处理
process.on("uncaughtException", (err) => {
  // 忽略终端相关的错误（通常在 Ctrl+C 时发生）
  if (err.code === "EIO" || err.code === "ENOTTY" || err.code === "EPIPE") {
    process.exit(0);
  }
  throw err;
});

// 处理 SIGINT 信号（Ctrl+C）
process.on("SIGINT", () => {
  process.exit(0);
});

/**
 * 主函数
 */
async function main() {
  // 处理命令行参数
  const args = process.argv.slice(2);

  // --version 或 -v - 显示版本号
  if (args[0] === "--version" || args[0] === "-v") {
    console.log(getVersion());
    return;
  }

  // --help 或 -h - 显示帮助信息
  if (args[0] === "--help" || args[0] === "-h") {
    showHelp();
    return;
  }

  let hasMigrationProgress = false;
  const migrationResult = migrateIfNeeded({
    onProgress: (current, total) => {
      hasMigrationProgress = true;
      process.stdout.write(`\r正在迁移配置: ${current}/${total}`);
    },
  });
  if (hasMigrationProgress) {
    process.stdout.write("\n");
  }
  if (migrationResult?.status === "completed") {
    console.log(chalk.green("\n✅ 配置迁移完成\n"));
  }
  if (migrationResult?.status === "failed") {
    console.log(chalk.red("\n❌ 配置迁移失败，已自动回滚。\n"));
    console.log(chalk.gray("旧配置未受影响："));
    console.log(chalk.gray("  ~/.claude/cc-tool/\n"));
    console.log(chalk.gray("错误日志："));
    console.log(chalk.gray("  ~/.cctoolbox/cctoolbox-migration-error.log\n"));
    console.log(chalk.yellow("建议："));
    console.log(chalk.gray("  1. 检查磁盘空间和文件权限"));
    console.log(chalk.gray("  2. 重新运行命令触发迁移"));
    console.log(chalk.gray("  3. 必要时手动复制配置\n"));
  }

  // reset 命令 - 恢复默认配置
  if (args[0] === "reset") {
    await resetConfig();
    return;
  }

  // install 命令 - 智能安装 CLI 工具
  if (args[0] === "install") {
    const cliType = args[1]; // 可选的 CLI 类型: claude, codex, gemini

    // 如果提供了 CLI 类型，验证是否有效
    if (cliType && !["claude", "codex", "gemini"].includes(cliType)) {
      console.log(chalk.red(`\n❌ 错误: 不支持的 CLI 类型 "${cliType}"\n`));
      console.log(chalk.gray("支持的类型: claude, codex, gemini\n"));
      console.log(chalk.yellow("用法:"));
      console.log(chalk.gray("  ct install          # 显示选择菜单"));
      console.log(chalk.gray("  ct install claude   # 直接安装 Claude Code"));
      console.log(chalk.gray("  ct install codex    # 直接安装 Codex"));
      console.log(chalk.gray("  ct install gemini   # 直接安装 Gemini\n"));
      return;
    }

    await handleSmartInstall(cliType);
    return;
  }

  // start 命令 - 启动服务（后台）
  if (args[0] === "start") {
    await handleStart();
    return;
  }

  // stop 命令 - 停止服务
  if (args[0] === "stop") {
    await handleStop();
    return;
  }

  // restart 命令 - 重启服务
  if (args[0] === "restart") {
    await handleRestart();
    return;
  }

  // status 命令 - 查看服务状态
  if (args[0] === "status") {
    await handleStatus();
    return;
  }

  // ui 命令 - Web UI 管理
  if (args[0] === "ui") {
    const subCommand = args[1];
    if (subCommand === "start") {
      await handleStart(); // UI start 实际上就是启动整个服务
    } else if (subCommand === "stop") {
      await handleStop();
    } else if (subCommand === "restart") {
      await handleRestart();
    } else {
      // 默认前台运行
      await handleUI();
    }
    return;
  }

  // channel 命令 - 渠道查看与切换
  if (args[0] === "channel" || args[0] === "channels") {
    await handleChannelCommand(args.slice(1));
    return;
  }

  // claude/codex/gemini 代理管理命令
  const channels = ["claude", "codex", "gemini"];
  if (channels.includes(args[0])) {
    const channel = args[0];
    const action = args[1] || "status";

    switch (action) {
      case "start":
        await proxyStart(channel);
        break;
      case "stop":
        await proxyStop(channel);
        break;
      case "restart":
        await handleProxyRestart(channel);
        break;
      case "status":
        await proxyStatus(channel);
        break;
      default:
        console.log(chalk.red(`\n❌ 未知操作: ${action}\n`));
        console.log(chalk.gray("支持的操作: start, stop, restart, status\n"));
    }
    return;
  }

  // logs 命令 - 日志管理
  if (args[0] === "logs") {
    const type = args[1] && !args[1].startsWith("--") ? args[1] : null;
    const options = {};

    // 解析选项
    for (let i = type ? 2 : 1; i < args.length; i++) {
      if (args[i] === "--lines" && args[i + 1]) {
        options.lines = parseInt(args[i + 1]);
        i++;
      } else if (args[i] === "--follow" || args[i] === "-f") {
        options.follow = true;
      } else if (args[i] === "--clear") {
        options.clear = true;
      }
    }

    await handleLogs(type, options);
    return;
  }

  // stats 命令 - 统计信息
  if (args[0] === "stats") {
    if (args[1] === "export") {
      const type = args[2] || null;
      await handleStatsExport(type);
    } else {
      const type = args[1] && !args[1].startsWith("--") ? args[1] : null;
      const options = {};

      // 解析选项
      for (let i = type ? 2 : 1; i < args.length; i++) {
        if (args[i] === "--today") options.today = true;
        else if (args[i] === "--week") options.week = true;
        else if (args[i] === "--month") options.month = true;
      }

      await handleStats(type, options);
    }
    return;
  }

  // doctor 命令 - 系统诊断
  if (args[0] === "doctor") {
    await handleDoctor();
    return;
  }

  // update 命令 - 检查并更新版本
  if (args[0] === "update") {
    await handleUpdate();
    return;
  }

  // 代理命令
  if (args[0] === "proxy") {
    const subCommand = args[1] || "start";

    switch (subCommand) {
      case "start":
        await handleProxyStart();
        return;

      case "stop":
        await handleProxyStop();
        return;

      case "status":
        handleProxyStatus();
        return;

      default:
        // 默认执行 start
        await handleProxyStart();
        return;
    }
  }

  // 加载配置
  let config = loadConfig();

  while (true) {
    // 显示主菜单
    const action = await showMainMenu(config);

    switch (action) {
      case "list":
        await handleList(
          config,
          async () => {
            const switched = await switchProject(config);
            if (switched) {
              // 重新加载配置以获取最新的项目设置
              config = loadConfig();
            }
            return switched;
          },
          true
        ); // crossProject = true，跨项目显示最近会话
        break;

      case "search":
        await handleSearch(config, async () => {
          const switched = await switchProject(config);
          if (switched) {
            config = loadConfig();
          }
          return switched;
        });
        break;

      case "switch":
        const switched = await switchProject(config);
        if (switched) {
          config = loadConfig();
          // 切换成功后自动进入会话列表
          await handleList(config, async () => {
            const switched = await switchProject(config);
            if (switched) {
              config = loadConfig();
            }
            return switched;
          });
        }
        break;

      case "switch-cli-type":
        await handleSwitchCliType();
        config = loadConfig(); // 重新加载配置以获取新的类型
        break;

      case "smart-install":
        await handleSmartInstall();
        break;

      case "switch-channel":
        await handleChannelManagement();
        break;
      case "channel-status":
        await handleChannelStatus();
        break;

      case "toggle-proxy":
        await handleToggleProxy();
        break;

      case "add-channel":
        await handleAddChannel();
        break;

      case "ui":
        await handleUI();
        break;

      case "port-config":
        await handlePortConfig();
        break;

      case "reset":
        await resetConfig();
        break;

      case "exit":
        console.log("\n👋 再见！\n");
        process.exit(0);
        break;

      default:
        console.log("未知操作");
        break;
    }
  }
}

// 启动应用
main().catch((error) => {
  console.error("程序出错:", error);
  process.exit(1);
});
