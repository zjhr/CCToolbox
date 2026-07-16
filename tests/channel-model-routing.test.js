/**
 * 最小自检：claude 渠道负载均衡偶发"找不到模型"根因回归
 *
 * 根因：调度器选渠道只看渠道配置声明的模型，忽略上游真实模型列表。
 *   当多个渠道配置都没填 customModels（靠上游 API 支持各自模型）时，
 *   preferChannelsForModel 无法区分，回退全部候选 -> 请求偶发路由到
 *   不支持该模型的渠道 -> 上游返回 model not found。
 *
 * 修复：后台预热上游真实模型缓存，preferChannelsForModel 在有上游缓存时
 *   严格只保留支持该模型的渠道，不再回退到不支持该模型的渠道。
 *
 * 该自检会在修复前的代码上失败（回退全部导致路由到不支持渠道），
 * 在修复后的代码上通过。
 */
const assert = require('assert');
const http = require('http');

function loadModules() {
  // 清除模块缓存，保证每次拿到干净实例
  for (const mod of [
    '../src/server/services/model-list',
    '../src/server/services/channel-scheduler',
  ]) {
    delete require.cache[require.resolve(mod)];
  }
  const modelList = require('../src/server/services/model-list');
  const scheduler = require('../src/server/services/channel-scheduler');
  return { modelList, scheduler };
}

// 启动一个本地 mock 上游，按 channelId 返回不同的 /models 列表
function startMockUpstream(routes) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const route = routes[req.url] || routes['*'];
      if (!route) {
        res.statusCode = 404;
        res.end('{}');
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: route.map((id) => ({ id })) }));
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

async function main() {
  const { modelList, scheduler } = loadModules();
  const { preferChannelsForModel } = scheduler;
  const { primeModelsCache, getCachedModelsSync } = modelList;

  // 复刻主人场景：两个渠道都没填 customModels/modelConfig（配置声明为空），
  // 但上游真实支持不同模型——一个有 grok，一个没有。
  const channelA = { id: 'ch-a', baseUrl: 'http://a', apiKey: 'k', customModels: [] };
  const channelB = { id: 'ch-b', baseUrl: 'http://b', apiKey: 'k', customModels: [] };
  const channels = [channelA, channelB];

  // 1) 冷启动：无任何上游缓存，配置声明也为空 -> 无法判断，返回全部（保持旧行为）
  const cold = preferChannelsForModel(channels, 'grok-1');
  assert.strictEqual(
    cold.length,
    2,
    '冷启动无缓存无配置声明时应返回全部候选（不限制）'
  );

  // 2) 模拟后台预热完成：channelA 上游支持 grok + claude，channelB 仅 claude
  //    上游真实模型缓存由 model-list 内部状态维护（primeModelsCache 拉取 /models 后写入），
  //    无法从外部直接注入。这里改为验证修复后的核心判定函数契约：
  //    配置声明为空且无缓存时，不声称支持任何模型（不确定而非误判支持）。
  assert.strictEqual(
    scheduler.channelSupportsModel(channelA, 'grok-1'),
    false,
    '配置无声明且无缓存时，channelSupportsModel 应返回 false（不确定而非误判支持）'
  );
  assert.strictEqual(
    scheduler.channelDeclaresModels(channelA),
    false,
    '配置无声明且无缓存时，channelDeclaresModels 应返回 false'
  );

  // 3) 关键回归：当渠道有配置声明且全不匹配，且无上游缓存时，
  //    保持旧行为回退全部（配置只是 hint，可能漏列，不误杀）。
  const declaredA = { id: 'ch-a', customModels: ['claude-sonnet-4-5'] };
  const declaredB = { id: 'ch-b', customModels: ['claude-opus-4'] };
  const noMatch = preferChannelsForModel([declaredA, declaredB], 'grok-1');
  assert.strictEqual(
    noMatch.length,
    2,
    '仅有配置声明 hint、无上游缓存且全不匹配时，应回退全部（避免误杀合法请求）'
  );

  // 4) 有配置声明且能匹配时，严格只返回支持渠道
  const matched = preferChannelsForModel(
    [
      { id: 'ch-a', customModels: ['grok-1'] },
      { id: 'ch-b', customModels: ['claude-sonnet-4-5'] },
    ],
    'grok-1'
  );
  assert.strictEqual(matched.length, 1, '有匹配时应严格只返回支持渠道');
  assert.strictEqual(matched[0].id, 'ch-a', '应路由到支持 grok 的渠道');

  // 5) ★核心回归★：复刻主人场景——两个渠道都没填配置声明，
  //    上游真实支持不同模型。用本地 mock 上游让 primeModelsCache 真实填充缓存，
  //    验证 grok 请求被严格路由到有 grok 的渠道，不再回退到不支持的渠道。
  const upstream = await startMockUpstream({
    '/models': ['grok-1', 'claude-sonnet-4-5'], // channelA 上游
  });
  const upstreamB = await startMockUpstream({
    '/models': ['claude-sonnet-4-5'], // channelB 上游（无 grok）
  });
  try {
    const chA = {
      id: 'ch-a',
      baseUrl: `http://127.0.0.1:${upstream.port}`,
      apiKey: 'k',
      customModels: [],
    };
    const chB = {
      id: 'ch-b',
      baseUrl: `http://127.0.0.1:${upstreamB.port}`,
      apiKey: 'k',
      customModels: [],
    };

    // 后台预热：拉取上游真实模型并填充缓存（等价于 refreshChannels 的预热步骤）
    await primeModelsCache(chA, 'claude', true);
    await primeModelsCache(chB, 'claude', true);

    // 缓存应已命中
    assert.ok(
      Array.isArray(getCachedModelsSync(chA, 'claude')) &&
        getCachedModelsSync(chA, 'claude').includes('grok-1'),
      'channelA 上游缓存应包含 grok-1'
    );
    assert.ok(
      Array.isArray(getCachedModelsSync(chB, 'claude')) &&
        !getCachedModelsSync(chB, 'claude').includes('grok-1'),
      'channelB 上游缓存不应包含 grok-1'
    );

    // channelSupportsModel 应基于上游缓存准确判定（主人场景修复的核心）
    assert.strictEqual(
      scheduler.channelSupportsModel(chA, 'grok-1'),
      true,
      '预热后 channelA 应被判定支持 grok-1'
    );
    assert.strictEqual(
      scheduler.channelSupportsModel(chB, 'grok-1'),
      false,
      '预热后 channelB 应被判定不支持 grok-1'
    );

    // 修复前：preferChannelsForModel 回退全部 2 个 -> 偶发路由到 chB -> 上游 model not found
    // 修复后：严格只返回 chA
    const routed = preferChannelsForModel([chA, chB], 'grok-1');
    assert.strictEqual(routed.length, 1, '有上游缓存时，grok 应只路由到支持它的渠道');
    assert.strictEqual(routed[0].id, 'ch-a', 'grok 应严格路由到 channelA，不回退到不支持的 channelB');

    // 6) ★防御性回归★：两个渠道都有上游缓存但都不含某模型时，
    //    不再回退全部（避免路由到明确不支持该模型的渠道）。
    //    修复前：回退全部 2 个 -> 偶发 model not found
    //    修复后：hasUpstreamCache 为 true -> 返回空
    const bothNoGrok = preferChannelsForModel([chA, chB], 'nonexistent-model-xyz');
    assert.strictEqual(
      bothNoGrok.length,
      0,
      '两渠道都有上游缓存且都不支持该模型时，应返回空，不回退全部'
    );
  } finally {
    await upstream.close();
    await upstreamB.close();
  }

  console.log('channel-model-routing.test.js passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
