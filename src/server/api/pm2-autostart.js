const express = require('express');
const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pm2 = require('pm2');

const execAsync = promisify(exec);

/**
 * Check if PM2 autostart is enabled
 * by looking for PM2 startup script in system
 */
async function checkAutoStartStatus() {
  try {
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS - check for LaunchDaemon
      const launchDaemonsPath = path.join(os.homedir(), 'Library/LaunchDaemons');
      const pm2Files = fs.existsSync(launchDaemonsPath)
        ? fs.readdirSync(launchDaemonsPath).filter(f => f.includes('pm2'))
        : [];

      return { enabled: pm2Files.length > 0, platform: 'darwin' };
    } else if (platform === 'linux') {
      // Linux - check for systemd service
      const systemdPath = '/etc/systemd/system/pm2-root.service';
      const userSystemdPath = path.join(os.homedir(), '.config/systemd/user/pm2-*.service');

      const rootExists = fs.existsSync(systemdPath);
      const userExists = fs.existsSync(path.join(os.homedir(), '.config/systemd/user')) &&
        fs.readdirSync(path.join(os.homedir(), '.config/systemd/user')).some(f => f.includes('pm2'));

      return { enabled: rootExists || userExists, platform: 'linux' };
    } else if (platform === 'win32') {
      // Windows - check for PM2 service in registry (simplified check)
      // For now, assume Windows support via pm2 package manager
      return { enabled: false, platform: 'win32', note: '暂不支持 Windows' };
    }

    return { enabled: false, platform };
  } catch (err) {
    console.error('Error checking autostart status:', err);
    return { enabled: false, error: err.message };
  }
}

/**
 * Enable PM2 autostart
 * Runs: pm2 startup && pm2 save
 */
async function enableAutoStart() {
  return new Promise((resolve) => {
    pm2.connect((err) => {
      if (err) {
        console.error('PM2 connect error:', err);
        return resolve({
          success: false,
          message: '无法连接到 PM2：' + (err.message || '未知错误'),
          error: err.message
        });
      }

      // Get current process list
      pm2.list((listErr, processes) => {
        if (listErr) {
          pm2.disconnect();
          console.error('PM2 list error:', listErr);
          return resolve({
            success: false,
            message: '无法获取 PM2 进程列表：' + (listErr.message || '未知错误')
          });
        }

        // If no processes are running, we can't really set up autostart
        if (!processes || processes.length === 0) {
          pm2.disconnect();
          return resolve({
            success: false,
            message: '暂无运行中的进程，无法启用开机自启。请先启动服务：ct start'
          });
        }

        // Save current process list
        pm2.dump((saveErr) => {
          if (saveErr) {
            pm2.disconnect();
            console.error('PM2 save error:', saveErr);
            return resolve({
              success: false,
              message: '无法保存 PM2 配置：' + (saveErr.message || '未知错误')
            });
          }

          // Run startup command
          const platform = process.platform;
          const user = os.userInfo().username;
          const homeDir = os.homedir();
          const homeArg = JSON.stringify(homeDir);
          const command = platform === 'darwin'
            ? `pm2 startup launchd -u ${user} --hp ${homeArg}`
            : platform === 'linux'
            ? `pm2 startup systemd -u ${user} --hp ${homeArg}`
            : 'pm2 startup';

          const runStartupCommand = (callback) => {
            if (platform === 'darwin') {
              const envPath = process.env.PATH || '';
              const appleCommand = `env PATH=${JSON.stringify(envPath)} ${command}`;
              const appleScript = `do shell script ${JSON.stringify(appleCommand)} with administrator privileges`;
              return execFile('osascript', ['-e', appleScript], { timeout: 30000 }, callback);
            }
            return exec(command, { shell: '/bin/bash', timeout: 30000 }, callback);
          };

          console.log(`Running startup command: ${command}`);

          runStartupCommand((execErr, stdout, stderr) => {
            pm2.disconnect();
            const combinedOutput = [stdout, stderr].filter(Boolean).join('\n').trim();
            const sudoLine = combinedOutput
              .split('\n')
              .map(line => line.trim())
              .find(line => line.startsWith('sudo '));

            if (execErr) {
              console.error('Startup command error:', execErr);
              if (stderr) {
                console.error('stderr:', stderr);
              }
              if (stdout) {
                console.error('stdout:', stdout);
              }

              // Check if it's already enabled
              if (combinedOutput.includes('already')) {
                return resolve({
                  success: true,
                  message: '开机自启已启用（或已存在）'
                });
              }

              if (combinedOutput.includes('copy/paste the following command') || sudoLine) {
                return resolve({
                  success: false,
                  message: sudoLine
                    ? '需要管理员权限，请在终端执行以下命令完成开机自启：\n' + sudoLine
                    : '需要管理员权限，请在终端执行 PM2 提示的 sudo 命令完成开机自启。' +
                      (combinedOutput ? '\n' + combinedOutput : '')
                });
              }

              return resolve({
                success: false,
                message: '启用失败：' +
                  (combinedOutput || execErr.message || '请确保已安装 PM2 且有足够权限'),
                error: execErr.message
              });
            }

            console.log('Startup command output:', stdout);
            return resolve({
              success: true,
              message: '开机自启已启用。重启电脑后自动启动'
            });
          });
        });
      });
    });
  });
}

/**
 * Disable PM2 autostart
 * Runs: pm2 unstartup
 */
async function disableAutoStart() {
  return new Promise((resolve) => {
    pm2.connect((err) => {
      if (err) {
        console.error('PM2 connect error:', err);
        return resolve({
          success: false,
          message: '无法连接到 PM2：' + (err.message || '未知错误')
        });
      }

      // Run unstartup command
      const platform = process.platform;
      const command = platform === 'darwin'
        ? 'pm2 unstartup launchd -u $(whoami)'
        : platform === 'linux'
        ? 'pm2 unstartup systemd -u $(whoami)'
        : 'pm2 unstartup';

      console.log(`Running unstartup command: ${command}`);

      exec(command, { shell: '/bin/bash', timeout: 30000 }, (execErr, stdout, stderr) => {
        pm2.disconnect();

        if (execErr) {
          console.error('Unstartup command error:', execErr);
          console.error('stderr:', stderr);

          // Check if it's not set up
          if (stderr && stderr.includes('not set')) {
            return resolve({
              success: true,
              message: '开机自启已禁用（或未启用）'
            });
          }

          return resolve({
            success: false,
            message: '禁用失败。' + (stderr || execErr.message || '请确保已安装 PM2 且有足够权限'),
            error: execErr.message
          });
        }

        console.log('Unstartup command output:', stdout);
        return resolve({
          success: true,
          message: '开机自启已禁用'
        });
      });
    });
  });
}

module.exports = () => {
  const router = express.Router();

  /**
   * GET /api/pm2-autostart
   * Get current PM2 autostart status
   */
  router.get('/', async (req, res) => {
    try {
      const status = await checkAutoStartStatus();
      res.json({
        success: true,
        data: status
      });
    } catch (err) {
      console.error('Failed to check autostart status:', err);
      // 返回 200 状态码，让前端通过 success 字段判断
      res.json({
        success: false,
        message: 'Failed to check autostart status: ' + err.message
      });
    }
  });

  /**
   * POST /api/pm2-autostart
   * Enable or disable PM2 autostart
   * Body: { action: 'enable' | 'disable' }
   */
  router.post('/', async (req, res) => {
    try {
      const { action } = req.body;

      if (!action || !['enable', 'disable'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Must be "enable" or "disable"'
        });
      }

      let result;
      if (action === 'enable') {
        result = await enableAutoStart();
      } else {
        result = await disableAutoStart();
      }

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          data: { action, enabled: action === 'enable' }
        });
      } else {
        // 返回 200 状态码，让前端通过 success 字段判断
        res.json({
          success: false,
          message: result.message
        });
      }
    } catch (err) {
      console.error('Failed to configure autostart:', err);
      // 真正的服务器错误才返回 500
      res.status(500).json({
        success: false,
        message: '服务器错误：' + err.message
      });
    }
  });

  return router;
};
