import {
  getChannels as fetchClaudeChannels,
  createChannel as createClaudeChannel,
  updateChannel as updateClaudeChannel,
  deleteChannel as deleteClaudeChannel,
  applyChannelToSettings,
  getCurrentClaudeChannel,
  resetChannelHealth,
  testClaudeChannelSpeed,
  testCodexChannelSpeed,
  testGeminiChannelSpeed,
} from "../../api/channels";
import {
  claudePresets,
  presetCategories,
  getPresetById,
} from "../../config/claudePresets";
import {
  getCodexChannels,
  createCodexChannel,
  updateCodexChannel,
  deleteCodexChannel,
  writeCodexConfig,
  getCurrentCodexChannel,
  resetCodexChannelHealth,
} from "../../api/channels";
import {
  getGeminiChannels,
  createGeminiChannel,
  updateGeminiChannel,
  deleteGeminiChannel,
  writeGeminiConfig,
  clearGeminiConfig,
  getCurrentGeminiChannel,
  resetGeminiChannelHealth,
} from "../../api/channels";

const URL_REQUIRE_HTTP = /^https?:\/\//i;
const PROVIDER_KEY_PATTERN = /^[a-z0-9-]+$/i;

/**
 * 预设切换字段覆盖规则（集中化配置）
 *
 * 维护约定：
 * 1. `retainForPersistedEdit`：编辑已保存渠道时，保留原字段值
 * 2. `applyForCreate`：新建渠道切换预设时，直接应用预设值
 * 3. `presetValueResolvers`：统一定义“可被预设提供默认值”的字段来源
 *
 * 如未来要调整覆盖策略，只改此处配置与辅助函数，避免在 onPresetChange 分散硬编码。
 */
const PRESET_FIELD_OVERRIDE_RULES = {
  retainForPersistedEdit: ["name"],
  applyForCreate: ["name", "baseUrl", "websiteUrl"],
  presetValueResolvers: {
    name: (preset) => preset.name,
    baseUrl: (preset) => preset.baseUrl,
    websiteUrl: (preset) => preset.websiteUrl || "",
  },
};

function hasFieldValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function isPersistedChannelForm(form) {
  return hasFieldValue(form?.channelId) || hasFieldValue(form?.id);
}

function applyPresetFieldOverrides(form, preset, presetId) {
  const nextForm = { ...form, presetId };
  const persistedEdit = isPersistedChannelForm(form);

  Object.entries(PRESET_FIELD_OVERRIDE_RULES.presetValueResolvers).forEach(
    ([field, resolvePresetValue]) => {
      const presetValue = resolvePresetValue(preset);
      if (
        persistedEdit &&
        PRESET_FIELD_OVERRIDE_RULES.retainForPersistedEdit.includes(field)
      ) {
        return;
      }

      if (
        !persistedEdit &&
        PRESET_FIELD_OVERRIDE_RULES.applyForCreate.includes(field)
      ) {
        nextForm[field] = presetValue;
        return;
      }

      nextForm[field] = presetValue;
    }
  );

  return nextForm;
}

function normalizeConcurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num);
}

function normalizeWeight(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return 1;
  return Math.min(100, Math.round(num));
}

function normalizeAutoCompactRate(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 90;
  return Math.min(99, Math.max(50, Math.round(num)));
}

function validateRequired(label, value) {
  if (value === null || value === undefined || value === "") {
    return `${label}不能为空`;
  }
}

function validateHttpUrl(label, value, { required } = {}) {
  if (!value) {
    return required ? `${label}不能为空` : "";
  }
  if (!URL_REQUIRE_HTTP.test(value)) {
    return `${label}必须以 http:// 或 https:// 开头`;
  }
  try {
    new URL(value);
  } catch (err) {
    return `${label}不是合法的链接`;
  }
  return "";
}

function resolveChannelApiKey(channel) {
  return (
    channel.rawApiKey ||
    channel.raw_api_key ||
    channel.apiKey ||
    channel.api_key ||
    ""
  );
}

function validateProviderKey(value) {
  if (!value) {
    return "Provider Key 不能为空";
  }
  if (!PROVIDER_KEY_PATTERN.test(value)) {
    return "字母、数字、短横线组合，例如 openai";
  }
  return "";
}

function buildActiveTag(channel, helpers) {
  const currentChannelId =
    typeof helpers.getCurrentChannelId === "function"
      ? helpers.getCurrentChannelId()
      : null;
  if (currentChannelId && channel.id === currentChannelId) {
    return {
      text: "✓ 正在使用",
      type: "success",
      color: { color: "#18a058", textColor: "#ffffff" },
      ariaLabel: "当前正在使用的渠道",
    };
  }
  return null;
}

const baseSections = {
  schedule: [
    {
      key: "maxConcurrency",
      label: "最大并发",
      type: "number",
      placeholder: "留空表示不限",
      clearable: true,
      validate: (value) => {
        if (value === null || value === undefined || value === "") return "";
        const num = Number(value);
        if (!Number.isFinite(num) || num <= 0) return "并发需为大于 0 的数字";
        if (num > 100) return "并发最多 100";
        return "";
      },
    },
    {
      key: "weight",
      label: "调度权重",
      type: "number",
      placeholder: "默认 1",
      min: 1,
      max: 100,
      validate: (value) => {
        const num = Number(value);
        if (!Number.isFinite(num) || num < 1) return "调度权重至少为 1";
        return "";
      },
    },
    {
      key: "enabled",
      label: "渠道状态",
      type: "switch",
      checkedText: "启用",
      uncheckedText: "停用",
    },
  ],
};

const channelPanelFactories = {
  claude: () => ({
    type: "claude",
    displayName: "Claude",
    schedulerSource: "claude",
    storageKeys: {
      localCollapse: "claudeChannelCollapse",
      collapseConfigKey: "claude",
      orderConfigKey: "claude",
    },
    emptyDescription: "暂无渠道",
    showEmptyAction: false,
    emptyActionText: "",
    modalWidth: 520,
    formLabelWidth: 95,
    showApplyButton: true,
    applyOnEditCurrent: true,
    presets: claudePresets,
    presetCategories,
    getPresetById,
    formSections: [
      {
        title: "供应商预设",
        fields: [
          {
            key: "presetId",
            label: "选择预设",
            type: "preset",
            placeholder: "选择供应商预设",
          },
        ],
      },
      {
        title: "基本信息",
        fields: [
          {
            key: "name",
            label: "渠道名称",
            type: "text",
            required: true,
            placeholder: "输入渠道名称",
          },
          {
            key: "baseUrl",
            label: "接口地址",
            type: "text",
            required: true,
            placeholder: "https://api.example.com",
            validate: (value) =>
              validateHttpUrl("接口地址", value, { required: true }),
          },
          {
            key: "apiKey",
            label: "接口密钥",
            type: "password",
            required: true,
            placeholder: "sk-...",
          },
          {
            key: "websiteUrl",
            label: "官网链接",
            type: "text",
            placeholder: "https://（选填）",
            validate: (value) =>
              validateHttpUrl("官网链接", value, { required: false }),
          },
          {
            key: "enable1M",
            label: "1M 上下文",
            type: "switch",
            checkedText: "开启",
            uncheckedText: "关闭",
          },
          {
            key: "enableToolSearch",
            label: "ToolSearch",
            type: "select",
            options: [
              { label: "开启", value: "1" },
              { label: "关闭", value: "0" },
              { label: "自动", value: "auto" },
            ],
          },
        ],
      },
      {
        title: "模型配置",
        description: "非官方供应商需要配置模型映射",
        collapsible: true,
        showWhen: (form) => {
          const hasModelConfig = Boolean(
            form.modelConfig?.model ||
              form.modelConfig?.haikuModel ||
              form.modelConfig?.sonnetModel ||
              form.modelConfig?.opusModel
          );
          return (
            (form.presetId && form.presetId !== "official") || hasModelConfig
          );
        },
        fields: [
          {
            key: "modelConfig.model",
            label: "主模型",
            type: "text",
            placeholder: "如 glm-4.7",
          },
          {
            key: "modelConfig.haikuModel",
            label: "Haiku 模型",
            type: "text",
            placeholder: "如 glm-4.5-air",
          },
          {
            key: "modelConfig.sonnetModel",
            label: "Sonnet 模型",
            type: "text",
            placeholder: "如 glm-4.7",
          },
          {
            key: "modelConfig.opusModel",
            label: "Opus 模型",
            type: "text",
            placeholder: "如 glm-4.7",
          },
        ],
      },
      {
        title: "调度配置",
        fields: baseSections.schedule,
      },
      {
        title: "网络代理",
        description: "部分渠道可能需要代理才能访问",
        collapsible: true,
        fields: [
          {
            key: "proxyUrl",
            label: "代理地址",
            type: "text",
            placeholder: "http://127.0.0.1:7890（选填）",
          },
        ],
      },
    ],
    getInitialForm: () => ({
      channelId: "",
      presetId: "official",
      name: "Claude 官方",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      websiteUrl: "https://www.anthropic.com",
      modelConfig: {
        model: "",
        haikuModel: "",
        sonnetModel: "",
        opusModel: "",
      },
      proxyUrl: "",
      maxConcurrency: null,
      weight: 1,
      enabled: true,
      enable1M: false,
      enableToolSearch: "auto",
    }),
    mapChannelToForm: (channel) => {
      const normalizedModelConfig =
        channel.modelConfig && typeof channel.modelConfig === "object"
          ? channel.modelConfig
          : {};
      const hasLegacyModel = Boolean(channel.model);
      const hasModelConfig = Boolean(
        normalizedModelConfig.model ||
          normalizedModelConfig.haikuModel ||
          normalizedModelConfig.sonnetModel ||
          normalizedModelConfig.opusModel
      );
      const presetId = (channel.presetId || hasLegacyModel || hasModelConfig)
        ? channel.presetId || "custom"
        : "official";

      return {
        channelId: channel.id || "",
        presetId,
        name: channel.name || "",
        baseUrl: channel.baseUrl || channel.baseURL || "",
        apiKey: resolveChannelApiKey(channel),
        websiteUrl: channel.websiteUrl || "",
        modelConfig: {
          model: normalizedModelConfig.model || channel.model || "",
          haikuModel: normalizedModelConfig.haikuModel || "",
          sonnetModel: normalizedModelConfig.sonnetModel || "",
          opusModel: normalizedModelConfig.opusModel || "",
        },
        proxyUrl: channel.proxyUrl || "",
        maxConcurrency: channel.maxConcurrency ?? null,
        weight: channel.weight || 1,
        enabled: channel.enabled !== false,
        enable1M: channel.enable1M === true,
        enableToolSearch:
          channel.enableToolSearch === "1" ||
          channel.enableToolSearch === "0" ||
          channel.enableToolSearch === "auto"
            ? channel.enableToolSearch
            : "auto",
      };
    },
    onPresetChange: (presetId, form) => {
      const preset = getPresetById(presetId);
      if (!preset) return form;

      const newForm = applyPresetFieldOverrides(form, preset, presetId);

      if (preset.env) {
        newForm.modelConfig = {
          model: preset.env.ANTHROPIC_MODEL || "",
          haikuModel: preset.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || "",
          sonnetModel: preset.env.ANTHROPIC_DEFAULT_SONNET_MODEL || "",
          opusModel: preset.env.ANTHROPIC_DEFAULT_OPUS_MODEL || "",
        };
      }

      return newForm;
    },
    testFn: testClaudeChannelSpeed,
    api: {
      fetch: async () => {
        const data = await fetchClaudeChannels();
        return data.channels || [];
      },
      getCurrentChannel: async () => {
        return getCurrentClaudeChannel();
      },
      create: async (form) => {
        await createClaudeChannel(
          form.name,
          form.baseUrl,
          form.apiKey,
          form.websiteUrl || undefined,
          {
            maxConcurrency: normalizeConcurrency(form.maxConcurrency),
            weight: normalizeWeight(form.weight),
            enabled: form.enabled,
            enable1M: form.enable1M,
            enableToolSearch: form.enableToolSearch,
            presetId: form.presetId,
            modelConfig: form.modelConfig,
            proxyUrl: form.proxyUrl || "",
          },
        );
      },
      update: async (channel, form) => {
        await updateClaudeChannel(channel.id, {
          name: form.name,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          websiteUrl: form.websiteUrl,
          maxConcurrency: normalizeConcurrency(form.maxConcurrency),
          weight: normalizeWeight(form.weight),
          enabled: form.enabled,
          enable1M: form.enable1M,
          enableToolSearch: form.enableToolSearch,
          presetId: form.presetId,
          modelConfig: form.modelConfig,
          proxyUrl: form.proxyUrl || "",
        });
      },
      toggle: async (channel, enabled) => {
        await updateClaudeChannel(channel.id, { enabled });
      },
      remove: deleteClaudeChannel,
      applyToSettings: async (channel) => {
        return applyChannelToSettings(channel.id);
      },
      resetHealth: async (channel) => {
        return resetChannelHealth(channel.id);
      },
    },
    getHeaderTags: (channel, helpers) => {
      const tags = [];
      const activeTag = buildActiveTag(channel, helpers);
      if (activeTag) {
        tags.push(activeTag);
      }
      if (channel.health?.status === "frozen") {
        tags.push({
          text: helpers.formatFreeze(channel.health.freezeRemaining),
          type: "error",
        });
      } else if (channel.health?.status === "checking") {
        tags.push({ text: "检测中", type: "warning" });
      }
      if (channel.enabled === false) {
        tags.push({ text: "未启用", type: "default" });
      }
      return tags;
    },
    buildInfoRows: (channel, helpers) => {
      const rows = [
        { label: "URL", value: channel.baseUrl },
        {
          label: "Key",
          value: helpers.maskApiKey(channel.apiKey),
          mono: true,
          action:
            channel.health?.status !== "healthy"
              ? () => helpers.handleResetHealth(channel)
              : null,
          actionLabel: "重置状态",
        },
      ];
      return rows;
    },
  }),
  codex: () => ({
    type: "codex",
    displayName: "Codex",
    schedulerSource: "codex",
    storageKeys: {
      localCollapse: "codexChannelCollapse",
      collapseConfigKey: "codex",
      orderConfigKey: "codex",
    },
    emptyDescription: "暂无渠道",
    showEmptyAction: true,
    emptyActionText: "添加 Codex 渠道",
    modalWidth: 600,
    formLabelWidth: 90,
    showApplyButton: true,
    applyOnEditCurrent: true,
    formSections: [
      {
        title: "基本信息",
        fields: [
          {
            key: "name",
            label: "渠道名称",
            type: "text",
            required: true,
            placeholder: "显示名称",
          },
          {
            key: "providerKey",
            label: "Provider Key",
            type: "text",
            required: true,
            placeholder: "英文标识，如 openai",
            disabledOnEdit: true,
            validate: validateProviderKey,
          },
          {
            key: "baseUrl",
            label: "Base URL",
            type: "text",
            required: true,
            placeholder: "https://api.example.com",
            validate: (value) =>
              validateHttpUrl("Base URL", value, { required: true }),
          },
          {
            key: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "sk-...",
          },
          {
            key: "websiteUrl",
            label: "官网链接",
            type: "text",
            placeholder: "https://（选填）",
            validate: (value) =>
              validateHttpUrl("官网链接", value, { required: false }),
          },
        ],
      },
      {
        title: "模型配置",
        fields: [
          {
            key: "modelName",
            label: "模型名称",
            type: "text",
            required: true,
            placeholder: "请输入模型名称",
            validate: (value) => validateRequired("模型名称", value),
          },
        ],
      },
      {
        title: "高级配置",
        collapsible: true,
        showWhen(form) {
          const autoCompactRateField = this.fields?.find(
            (field) => field.key === "autoCompactRate"
          );
          if (autoCompactRateField) {
            autoCompactRateField.disabledOnEdit = form.enable1M !== true;
          }
          return true;
        },
        fields: [
          {
            key: "enable1M",
            label: "1M 上下文",
            type: "switch",
            checkedText: "开启",
            uncheckedText: "关闭",
          },
          {
            key: "autoCompactRate",
            label: "自动压缩率(%)",
            type: "number",
            min: 50,
            max: 99,
            step: 1,
            validate: (value) => {
              const num = Number(value);
              if (!Number.isFinite(num)) return "自动压缩率需为数字";
              if (num < 50 || num > 99) return "自动压缩率范围为 50-99";
              return "";
            },
          },
        ],
      },
      {
        title: "调度配置",
        fields: baseSections.schedule,
      },
    ],
    applyConfirmTitle: "确认切换渠道",
    applyConfirmContent: "将写入 config.toml 与 auth.json，并同步环境变量，确定继续吗？",
    getInitialForm: () => ({
      name: "",
      providerKey: "",
      baseUrl: "",
      apiKey: "",
      websiteUrl: "",
      modelName: "gpt-5.5",
      enable1M: false,
      autoCompactRate: 90,
      maxConcurrency: null,
      weight: 1,
      enabled: true,
    }),
    mapChannelToForm: (channel) => ({
      name: channel.name || "",
      providerKey: channel.providerKey || "",
      baseUrl: channel.baseUrl || "",
      apiKey: resolveChannelApiKey(channel),
      websiteUrl: channel.websiteUrl || "",
      modelName: channel.modelName || "gpt-5.5",
      enable1M: channel.enable1M === true,
      autoCompactRate: normalizeAutoCompactRate(channel.autoCompactRate),
      maxConcurrency: channel.maxConcurrency ?? null,
      weight: channel.weight || 1,
      enabled: channel.enabled !== false,
    }),
    testFn: testCodexChannelSpeed,
    api: {
      fetch: async () => {
        const data = await getCodexChannels();
        return data.channels || [];
      },
      getCurrentChannel: async () => {
        return getCurrentCodexChannel();
      },
      create: async (form) => {
        await createCodexChannel(
          form.name,
          form.providerKey,
          form.baseUrl,
          form.apiKey,
          form.websiteUrl || "",
          {
            maxConcurrency: normalizeConcurrency(form.maxConcurrency),
            weight: normalizeWeight(form.weight),
            enabled: form.enabled,
            modelName: form.modelName,
            enable1M: form.enable1M === true,
            autoCompactRate:
              form.enable1M === true
                ? normalizeAutoCompactRate(form.autoCompactRate)
                : undefined,
          },
        );
      },
      update: async (channel, form) => {
        await updateCodexChannel(channel.id, {
          name: form.name,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          websiteUrl: form.websiteUrl,
          maxConcurrency: normalizeConcurrency(form.maxConcurrency),
          weight: normalizeWeight(form.weight),
          enabled: form.enabled,
          modelName: form.modelName,
          enable1M: form.enable1M === true,
          autoCompactRate:
            form.enable1M === true
              ? normalizeAutoCompactRate(form.autoCompactRate)
              : undefined,
        });
      },
      toggle: async (channel, enabled) =>
        updateCodexChannel(channel.id, { enabled }),
      remove: deleteCodexChannel,
      applyToSettings: async (channel) => {
        return writeCodexConfig(channel.id);
      },
      resetHealth: async (channel) => {
        return resetCodexChannelHealth(channel.id);
      },
    },
    getHeaderTags: (channel, helpers) => {
      const tags = [];
      const activeTag = buildActiveTag(channel, helpers);
      if (activeTag) {
        tags.push(activeTag);
      }
      if (channel.health?.status === "frozen") {
        tags.push({
          text: helpers.formatFreeze(channel.health.freezeRemaining),
          type: "error",
        });
      } else if (channel.health?.status === "checking") {
        tags.push({ text: "检测中", type: "warning" });
      }
      if (channel.enabled === false) {
        tags.push({ text: "已禁用", type: "default" });
      }
      return tags;
    },
    buildInfoRows: (channel, helpers) => [
      { label: "Provider", value: channel.providerKey, mono: true },
      { label: "URL", value: channel.baseUrl },
      {
        label: "Key",
        value: helpers.maskApiKey(channel.apiKey),
        mono: true,
        action:
          channel.health?.status !== "healthy"
            ? () => helpers.handleResetHealth(channel)
            : null,
        actionLabel: "重置状态",
      },
    ],
  }),
  gemini: () => ({
    type: "gemini",
    displayName: "Gemini",
    schedulerSource: "gemini",
    storageKeys: {
      localCollapse: "geminiChannelCollapse",
      collapseConfigKey: "gemini",
      orderConfigKey: "gemini",
    },
    emptyDescription: "暂无渠道",
    showEmptyAction: true,
    emptyActionText: "添加 Gemini 渠道",
    modalWidth: 520,
    formLabelWidth: 90,
    showApplyButton: true,
    showClearButton: true,
    clearButtonTooltip: "使用官方API",
    applyOnEditCurrent: true,
    applyConfirmContent: "仅写入配置，不会改变渠道启用状态，是否继续？",
    formSections: [
      {
        title: "基本信息",
        fields: [
          {
            key: "name",
            label: "渠道名称",
            type: "text",
            required: true,
            placeholder: "显示名称",
          },
          {
            key: "model",
            label: "Model",
            type: "text",
            required: true,
            placeholder: "例如 gemini-2.5-pro",
          },
          {
            key: "baseUrl",
            label: "Base URL",
            type: "text",
            required: true,
            placeholder: "https://generativelanguage.googleapis.com/v1beta",
            validate: (value) =>
              validateHttpUrl("Base URL", value, { required: true }),
          },
          {
            key: "apiKey",
            label: "API Key",
            type: "password",
            required: true,
            placeholder: "AIza...",
          },
          {
            key: "websiteUrl",
            label: "官网链接",
            type: "text",
            placeholder: "https://（选填）",
            validate: (value) =>
              validateHttpUrl("官网链接", value, { required: false }),
          },
        ],
      },
      {
        title: "调度配置",
        fields: baseSections.schedule,
      },
    ],
    getInitialForm: () => ({
      name: "",
      model: "",
      baseUrl: "",
      apiKey: "",
      websiteUrl: "",
      maxConcurrency: null,
      weight: 1,
      enabled: true,
    }),
    mapChannelToForm: (channel) => ({
      name: channel.name || "",
      model: channel.model || "",
      baseUrl: channel.baseUrl || "",
      apiKey: resolveChannelApiKey(channel),
      websiteUrl: channel.websiteUrl || "",
      maxConcurrency: channel.maxConcurrency ?? null,
      weight: channel.weight || 1,
      enabled: channel.enabled !== false,
    }),
    testFn: testGeminiChannelSpeed,
    api: {
      fetch: async () => {
        const data = await getGeminiChannels();
        return data.channels || [];
      },
      getCurrentChannel: async () => {
        return getCurrentGeminiChannel();
      },
      create: async (form) => {
        await createGeminiChannel(
          form.name,
          form.baseUrl,
          form.apiKey,
          form.model,
          form.websiteUrl || "",
          {
            maxConcurrency: normalizeConcurrency(form.maxConcurrency),
            weight: normalizeWeight(form.weight),
            enabled: form.enabled,
          },
        );
      },
      update: async (channel, form) => {
        await updateGeminiChannel(channel.id, {
          name: form.name,
          model: form.model,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          websiteUrl: form.websiteUrl,
          maxConcurrency: normalizeConcurrency(form.maxConcurrency),
          weight: normalizeWeight(form.weight),
          enabled: form.enabled,
        });
      },
      toggle: async (channel, enabled) =>
        updateGeminiChannel(channel.id, { enabled }),
      remove: deleteGeminiChannel,
      applyToSettings: async (channel) => {
        return writeGeminiConfig(channel.id);
      },
      clearConfig: async () => {
        return clearGeminiConfig();
      },
      resetHealth: async (channel) => {
        return resetGeminiChannelHealth(channel.id);
      },
    },
    getHeaderTags: (channel, helpers) => {
      const tags = [];
      const activeTag = buildActiveTag(channel, helpers);
      if (activeTag) {
        tags.push(activeTag);
      }
      if (channel.health?.status === "frozen") {
        tags.push({
          text: helpers.formatFreeze(channel.health.freezeRemaining),
          type: "error",
        });
      } else if (channel.health?.status === "checking") {
        tags.push({ text: "检测中", type: "warning" });
      }
      if (channel.enabled === false) {
        tags.push({ text: "已禁用", type: "default" });
      }
      return tags;
    },
    buildInfoRows: (channel, helpers) => [
      { label: "Model", value: channel.model, mono: true },
      { label: "URL", value: channel.baseUrl },
      {
        label: "Key",
        value: helpers.maskApiKey(channel.apiKey),
        mono: true,
        action:
          channel.health?.status !== "healthy"
            ? () => helpers.handleResetHealth(channel)
            : null,
        actionLabel: "重置状态",
      },
    ],
  }),
};

export default channelPanelFactories;
