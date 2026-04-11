const assert = require('assert');
const childProcess = require('child_process');

function setPlatform(value) {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value
  });
}

function withMockedExecSync(mockImpl, run) {
  const originalExecSync = childProcess.execSync;
  childProcess.execSync = mockImpl;
  delete require.cache[require.resolve('../src/utils/port-helper')];
  const helper = require('../src/utils/port-helper');

  try {
    run(helper);
  } finally {
    childProcess.execSync = originalExecSync;
    delete require.cache[require.resolve('../src/utils/port-helper')];
  }
}

function runPortHelperTests() {
  const originalPlatform = process.platform;

  try {
    // Windows: should parse netstat output by local port and dedupe pids
    setPlatform('win32');
    withMockedExecSync((command, options) => {
      assert.ok(command.includes('netstat -ano -p tcp | findstr :10099'));
      return [
        '  TCP    127.0.0.1:10099   0.0.0.0:0      LISTENING       1234',
        '  TCP    [::]:10099        [::]:0         LISTENING       5678',
        '  TCP    127.0.0.1:100990  0.0.0.0:0      LISTENING       8888',
        '  TCP    127.0.0.1:49123   8.8.8.8:10099  ESTABLISHED     9999',
        '  TCP    127.0.0.1:10099   0.0.0.0:0      LISTENING       1234'
      ].join('\r\n');
    }, (helper) => {
      const pids = helper.findProcessByPort(10099);
      assert.deepStrictEqual(pids, ['1234', '5678']);
    });

    // Linux fallback: lsof failure should fallback to fuser
    setPlatform('linux');
    const linuxCommands = [];
    withMockedExecSync((command) => {
      linuxCommands.push(command);
      if (command.startsWith('lsof')) {
        throw new Error('lsof missing');
      }
      if (command.startsWith('fuser')) {
        return '111 222  not-a-pid';
      }
      throw new Error('unexpected command');
    }, (helper) => {
      const pids = helper.findProcessByPort(10099);
      assert.deepStrictEqual(pids, ['111', '222']);
      assert.ok(linuxCommands.some(cmd => cmd.startsWith('lsof -ti :10099')));
      assert.ok(linuxCommands.some(cmd => cmd.startsWith('fuser 10099/tcp')));
    });

    // Windows kill: should use taskkill and return true when any pid killed
    setPlatform('win32');
    const killCommands = [];
    withMockedExecSync((command) => {
      killCommands.push(command);
      if (command.startsWith('netstat')) {
        return [
          '  TCP    127.0.0.1:10099   0.0.0.0:0      LISTENING       2001',
          '  TCP    127.0.0.1:10099   0.0.0.0:0      LISTENING       2002'
        ].join('\r\n');
      }
      if (command === 'taskkill /PID 2001 /F') {
        throw new Error('access denied');
      }
      if (command === 'taskkill /PID 2002 /F') {
        return '';
      }
      throw new Error('unexpected command');
    }, (helper) => {
      const killed = helper.killProcessByPort(10099);
      assert.strictEqual(killed, true);
      assert.ok(killCommands.includes('taskkill /PID 2001 /F'));
      assert.ok(killCommands.includes('taskkill /PID 2002 /F'));
    });

    // Windows kill: no pid means false
    setPlatform('win32');
    withMockedExecSync(() => {
      throw new Error('no matches');
    }, (helper) => {
      const killed = helper.killProcessByPort(10099);
      assert.strictEqual(killed, false);
    });
  } finally {
    setPlatform(originalPlatform);
  }

  console.log('port-helper tests passed');
}

runPortHelperTests();
