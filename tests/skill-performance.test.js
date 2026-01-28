const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cctoolbox-skill-perf-test-'));
  process.env.CCTOOLBOX_HOME = tempRoot;
  process.env.HOME = tempRoot;

  const { SkillService } = require('../src/server/services/skill-service');
  const service = new SkillService();

  let concurrent = 0;
  let maxConcurrent = 0;
  const tasks = Array.from({ length: 6 }, () => service.uploadLimiter(async () => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await delay(10);
    concurrent -= 1;
  }));
  await Promise.all(tasks);
  assert.ok(maxConcurrent <= 3);

  const order = [];
  await Promise.all([
    service.withSkillLock('demo-skill', async () => {
      order.push('start1');
      await delay(20);
      order.push('end1');
    }),
    service.withSkillLock('demo-skill', async () => {
      order.push('start2');
      await delay(5);
      order.push('end2');
    })
  ]);

  const start2Index = order.indexOf('start2');
  const end1Index = order.indexOf('end1');
  assert.ok(start2Index > end1Index);

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log('Skill performance tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
