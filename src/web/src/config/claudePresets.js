/**
 * Claude 渠道预设配置
 * 参考 cc-switch 的 claudeProviderPresets.ts
 */

/**
 * 统一生成 Anthropic 相关模型环境变量，避免在每个预设中重复散落定义。
 *
 * 维护约定：
 * 1. `defaultModel` 作为该 provider 的基准默认模型唯一入口。
 * 2. 如某 provider 需要差异化模型（例如智谱），通过 `overrides` 覆盖具体字段。
 * 3. 新增 provider 时优先复用此方法，减少回归风险。
 */
function createAnthropicEnv(defaultModel, overrides = {}) {
  return {
    ANTHROPIC_MODEL: defaultModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: defaultModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: defaultModel,
    ANTHROPIC_DEFAULT_OPUS_MODEL: defaultModel,
    ...overrides,
  };
}

export const claudePresets = [
  {
    id: "official",
    name: "Claude 官方",
    category: "official",
    websiteUrl: "https://www.anthropic.com",
    baseUrl: "https://api.anthropic.com",
    env: {},
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    category: "cn_official",
    websiteUrl: "https://platform.deepseek.com",
    baseUrl: "https://api.deepseek.com/anthropic",
    env: createAnthropicEnv("deepseek-v4-pro", {
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-v4-flash",
    }),
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    category: "cn_official",
    websiteUrl: "https://open.bigmodel.cn",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    env: createAnthropicEnv("glm-5", {
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-4.7",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-5.1",
    }),
  },
  {
    id: "kimi",
    name: "Kimi",
    category: "cn_official",
    websiteUrl: "https://platform.moonshot.cn",
    baseUrl: "https://api.moonshot.cn/anthropic",
    env: createAnthropicEnv("kimi-2.6"),
  },
  {
    id: "minimax",
    name: "MiniMax",
    category: "cn_official",
    websiteUrl: "https://platform.minimaxi.com",
    baseUrl: "https://api.minimaxi.com/anthropic",
    env: createAnthropicEnv("minimax-m2.7"),
  },
  {
    id: "qwen",
    name: "通义千问",
    category: "cn_official",
    websiteUrl: "https://bailian.console.aliyun.com",
    baseUrl: "https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy",
    env: createAnthropicEnv("qwen3.6-plus"),
  },
  {
    id: "doubao",
    name: "豆包 Seed",
    category: "cn_official",
    websiteUrl: "https://www.volcengine.com/product/doubao",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
    env: createAnthropicEnv("doubao-seed-code-preview-latest"),
  },
];

// 预设分类
export const presetCategories = {
  official: "官方",
  cn_official: "国内官方",
  aggregator: "聚合服务",
  third_party: "第三方",
};

// 根据 ID 获取预设
export function getPresetById(id) {
  return claudePresets.find((p) => p.id === id);
}

// 获取分类下的预设列表
export function getPresetsByCategory(category) {
  return claudePresets.filter((p) => p.category === category);
}
