const assert = require('assert');

const { GitHubClient } = require('../src/server/services/github-client');

async function runTests() {
  let callCount = 0;
  const mockOctokit = {
    repos: {
      listTags: async () => {
        callCount += 1;
        if (callCount < 3) {
          throw new Error('network error');
        }
        return {
          data: [
            { name: '1.0.0' },
            { name: '0.9.0' }
          ]
        };
      }
    }
  };

  const client = new GitHubClient({
    octokit: mockOctokit,
    retryDelays: [1, 1]
  });

  const tags = await client.fetchUpdates('owner', 'repo');
  assert.strictEqual(tags.length, 2);
  assert.strictEqual(callCount, 3);

  assert.strictEqual(client.compareVersions('1.0.0', '1.0.1'), true);
  assert.strictEqual(client.compareVersions('invalid', '0.1.0'), true);
  assert.strictEqual(client.compareVersions('1.2.0', '1.0.0'), false);

  console.log('GitHub client tests passed');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
