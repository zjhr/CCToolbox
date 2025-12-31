#!/usr/bin/env node
// CCToolbox 通知脚本 - 自动生成，请勿手动修改
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const os = require('os');

const platform = os.platform();
const timestamp = new Date().toLocaleString('zh-CN');

// 系统通知
try {
  execSync("if command -v terminal-notifier &>/dev/null; then terminal-notifier -title \"CCToolbox\" -message \"任务已完成 | 等待交互\" -sound Glass -activate com.apple.Terminal; else osascript -e 'display notification \"任务已完成 | 等待交互\" with title \"CCToolbox\" sound name \"Glass\"'; fi", { stdio: 'ignore' });
} catch (e) {
  console.error('系统通知失败:', e.message);
}

