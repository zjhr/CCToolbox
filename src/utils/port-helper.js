const { execSync } = require('child_process');
const net = require('net');

function normalizePort(port) {
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return null;
  }
  return parsed;
}

function isNumericPid(pid) {
  return /^\d+$/.test(String(pid || '').trim());
}

/**
 * 检查端口是否被占用
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(false);
    });

    server.listen(port);
  });
}

/**
 * 检查端口是否可绑定（用于判断权限问题或系统保留端口）
 */
function canBindPort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const normalizedPort = normalizePort(port);
    if (!normalizedPort) {
      resolve(false);
      return;
    }

    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(normalizedPort, host);
  });
}

/**
 * 从给定端口开始寻找可绑定端口
 */
async function findAvailablePort(startPort, maxAttempts = 200, host = '127.0.0.1') {
  const normalizedStart = normalizePort(startPort);
  if (!normalizedStart) {
    return null;
  }

  let candidate = normalizedStart;
  let attempts = 0;
  while (candidate <= 65535 && attempts < maxAttempts) {
    const available = await canBindPort(candidate, host);
    if (available) {
      return candidate;
    }
    attempts += 1;
    candidate += 1;
  }

  return null;
}

/**
 * 查找占用端口的进程PID
 */
function findProcessByPort(port) {
  const normalizedPort = normalizePort(port);
  if (!normalizedPort) {
    return [];
  }

  if (process.platform === 'win32') {
    try {
      const result = execSync(`netstat -ano -p tcp | findstr :${normalizedPort}`, { encoding: 'utf-8' }).trim();
      const pids = new Set();
      const lines = result.split(/\r?\n/).filter(Boolean);

      lines.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) return;

        const localAddress = parts[1] || '';
        const pid = parts[parts.length - 1] || '';
        const localPortMatch = localAddress.match(/:(\d+)$/);
        if (!localPortMatch) return;
        if (Number(localPortMatch[1]) !== normalizedPort) return;
        if (!isNumericPid(pid)) return;

        pids.add(String(pid));
      });

      return Array.from(pids);
    } catch (err) {
      return [];
    }
  }

  try {
    // macOS/Linux 使用 lsof
    const result = execSync(`lsof -ti :${normalizedPort}`, { encoding: 'utf-8' }).trim();
    return result.split('\n').filter(pid => isNumericPid(pid));
  } catch (err) {
    // 如果 lsof 失败，尝试使用其他命令
    try {
      // 适用于某些 Linux 系统
      const result = execSync(`fuser ${normalizedPort}/tcp 2>/dev/null`, { encoding: 'utf-8' }).trim();
      return result.split(/\s+/).filter(pid => isNumericPid(pid));
    } catch (e) {
      return [];
    }
  }
}

/**
 * 杀掉占用端口的进程
 */
function killProcessByPort(port) {
  try {
    const pids = findProcessByPort(port);
    if (pids.length === 0) {
      return false;
    }

    let killedAny = false;
    pids.forEach(pid => {
      if (!isNumericPid(pid)) {
        return;
      }

      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        } else {
          execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
        }
        killedAny = true;
      } catch (err) {
        // 忽略单个进程杀掉失败的错误
      }
    });

    return killedAny;
  } catch (err) {
    return false;
  }
}

/**
 * 等待端口释放
 */
async function waitForPortRelease(port, timeout = 3000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return false;
}

module.exports = {
  isPortInUse,
  canBindPort,
  findAvailablePort,
  findProcessByPort,
  killProcessByPort,
  waitForPortRelease
};
