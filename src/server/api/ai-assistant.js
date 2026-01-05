const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const router = express.Router();
const { loadAIConfig } = require("../services/ai-config");
const { getAIServiceManager } = require("../services/ai-service");
const { normalizeAIError } = require("../services/ai-errors");
const {
  parseRealProjectPath,
  hasActualMessages,
} = require("../services/sessions");
const { getMetadata, setMetadata } = require("../services/session-metadata");
const { loadSummary, saveSummary } = require("../services/session-summary");

const MODEL_CONTEXT_TOKENS = {
  ollama: 8000,
  openai: 16000,
  gemini: 32000,
};

function resolveContextTokens(providerKey) {
  return MODEL_CONTEXT_TOKENS[providerKey] || 8000;
}

function resolveSessionFile(projectName, sessionId) {
  const { fullPath } = parseRealProjectPath(projectName);
  const possiblePaths = [
    path.join(fullPath, ".claude", "sessions", sessionId + ".jsonl"),
    path.join(
      os.homedir(),
      ".claude",
      "projects",
      projectName,
      sessionId + ".jsonl"
    ),
  ];

  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      return testPath;
    }
  }
  return null;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractUserContent(message) {
  if (!message) return "";
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    const parts = [];
    for (const item of message.content) {
      if (item.type === "text" && item.text) {
        parts.push(item.text);
      } else if (item.type === "tool_result") {
        const content =
          typeof item.content === "string"
            ? item.content
            : JSON.stringify(item.content, null, 2);
        parts.push(`[工具结果] ${content}`);
      } else if (item.type === "image") {
        parts.push("[图片]");
      }
    }
    return parts.join("\n");
  }
  return "";
}

function extractAssistantContent(message) {
  if (!message) return "";
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    const parts = [];
    for (const item of message.content) {
      if (item.type === "text" && item.text) {
        parts.push(item.text);
      } else if (item.type === "tool_use" && item.name) {
        parts.push(`[工具调用] ${item.name}`);
      }
    }
    return parts.join("\n");
  }
  return "";
}

async function loadSessionMessages(sessionFile) {
  const messages = [];
  const stream = fs.createReadStream(sessionFile, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      let json = null;
      try {
        json = JSON.parse(line);
      } catch (err) {
        continue;
      }
      if (json.type === "user") {
        const content = normalizeText(extractUserContent(json.message));
        if (content && content !== "Warmup") {
          messages.push({ role: "user", content });
        }
      } else if (json.type === "assistant") {
        const content = normalizeText(extractAssistantContent(json.message));
        if (content && content !== "Warmup") {
          messages.push({ role: "assistant", content });
        }
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return messages;
}

function buildTruncatedMessages(messages, headCount = 3, tailCount = 10) {
  if (messages.length <= headCount + tailCount) {
    return messages;
  }
  const head = messages.slice(0, headCount);
  const tail = messages.slice(-tailCount);
  const omitted = messages.length - headCount - tailCount;
  const marker = {
    role: "system",
    content: `（中间省略 ${omitted} 条消息以控制长度）`,
  };
  return [...head, marker, ...tail];
}

function buildSummaryMessages(messages, headCount = 5, tailCount = 15) {
  if (messages.length <= headCount + tailCount) {
    return messages;
  }
  const head = messages.slice(0, headCount);
  const tail = messages.slice(-tailCount);
  const middle = messages.slice(headCount, messages.length - tailCount);
  const targetSamples = Math.min(10, middle.length);
  const step = Math.max(1, Math.floor(middle.length / targetSamples));
  const sampled = [];
  for (let i = 0; i < middle.length; i += step) {
    sampled.push(middle[i]);
  }
  const marker = {
    role: "system",
    content: `（中间消息已按间隔采样，共保留 ${sampled.length} 条）`,
  };
  return [...head, marker, ...sampled, ...tail];
}

function truncateMessagesByTokens(messages, maxTokens) {
  const maxChars = maxTokens * 4;
  let totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
  if (totalChars <= maxChars) {
    return messages;
  }
  const perMessageLimit = Math.max(200, Math.floor(maxChars / messages.length));
  const trimmed = messages.map((msg) => {
    if (msg.content.length <= perMessageLimit) {
      return msg;
    }
    return {
      ...msg,
      content: `${msg.content.slice(0, perMessageLimit)}…`,
    };
  });
  totalChars = trimmed.reduce((sum, msg) => sum + msg.content.length, 0);
  if (totalChars <= maxChars) {
    return trimmed;
  }
  const lastMessage = trimmed[trimmed.length - 1];
  const allowed = Math.max(200, perMessageLimit - (totalChars - maxChars));
  trimmed[trimmed.length - 1] = {
    ...lastMessage,
    content: `${lastMessage.content.slice(0, allowed)}…`,
  };
  return trimmed;
}

function formatConversation(messages) {
  return messages
    .map((msg) => {
      const roleLabel =
        msg.role === "user"
          ? "用户"
          : msg.role === "assistant"
          ? "助手"
          : "系统";
      return `[${roleLabel}] ${msg.content}`;
    })
    .join("\n\n");
}

function buildAliasPrompt(conversationText) {
  return [
    "请根据以下对话内容生成一个简洁的会话标题和 2-4 个标签。",
    "要求：",
    "1) 标题控制在 20 个中文字符以内，突出“具体主题 + 关键动作/问题”。",
    "2) 标签为简短关键词，优先技术名词/模块/问题类型，避免泛化词与重复。",
    "3) 若内容较长，以最近讨论为主；不要使用“会话/聊天/对话”等泛标题。",
    '4) 必须返回严格 JSON，格式为 {"title":"...","tags":["..."]}，不要附加解释。',
    "",
    "对话内容：",
    conversationText,
  ].join("\n");
}

function buildSummaryPrompt(conversationText) {
  return [
    "请根据以下对话内容生成一份精简、明确的 Markdown 总结。",
    "要求：",
    "1) 标题固定为“## 对话总结”。",
    "2) 使用 3-6 条要点概括讨论结果，避免复述原话。",
    "3) 必须包含“结论：...”一行；若无结论写“结论：无”。",
    "4) 保持简洁，不超过 8 行。",
    "",
    "对话内容：",
    conversationText,
  ].join("\n");
}

function parseAliasResult(text) {
  if (!text) return null;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    return null;
  }
}

router.get("/metadata/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }
  try {
    const metadata = getMetadata(sessionId);
    res.json({ success: true, data: metadata });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/metadata", (req, res) => {
  const { sessionId, title, tags } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }
  try {
    const result = setMetadata(sessionId, { title, tags });
    res.json({ success: true, data: result.metadata, warning: result.warning });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/metadata/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }
  try {
    const result = setMetadata(sessionId, {});
    res.json({ success: true, data: result.metadata, warning: result.warning });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/generate-alias", async (req, res) => {
  const { projectName, sessionId, provider } = req.body || {};
  if (!projectName || !sessionId) {
    return res
      .status(400)
      .json({ error: "projectName and sessionId are required" });
  }

  const config = loadAIConfig();
  if (!config.privacyAccepted) {
    return res.status(403).json({ error: "请先同意隐私声明后再使用 AI 功能" });
  }

  try {
    const sessionFile = resolveSessionFile(projectName, sessionId);
    if (!sessionFile) {
      return res.status(404).json({ error: "未找到会话文件" });
    }

    if (!hasActualMessages(sessionFile)) {
      return res
        .status(404)
        .json({ error: "会话没有可用于生成别名的对话内容" });
    }

    const messages = await loadSessionMessages(sessionFile);
    if (!messages.length) {
      return res
        .status(404)
        .json({ error: "会话没有可用于生成别名的对话内容" });
    }

    const contextTokens = resolveContextTokens(
      provider || config.defaultProvider
    );
    const truncated = buildTruncatedMessages(messages, 3, 10);
    const trimmed = truncateMessagesByTokens(truncated, contextTokens);
    const prompt = buildAliasPrompt(formatConversation(trimmed));

    const aiService = getAIServiceManager();
    const result = await aiService.requestCompletion({
      providerKey: provider || config.defaultProvider,
      messages: [
        { role: "system", content: "你是擅长提炼对话标题和标签的助手。" },
        { role: "user", content: prompt },
      ],
      maxTokens: contextTokens,
      temperature: 0.2,
    });

    const parsed = parseAliasResult(result.text);
    if (!parsed?.title) {
      return res.status(502).json({ error: "解析 AI 返回内容失败" });
    }

    const title = normalizeText(parsed.title).slice(0, 40);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .map((tag) => normalizeText(tag))
          .filter(Boolean)
          .slice(0, 4)
      : [];

    res.json({
      success: true,
      data: {
        title,
        tags,
        provider: result.provider,
        model: result.model,
      },
    });
  } catch (error) {
    if (
      error?.message === "Invalid project path" ||
      error?.message?.includes("Invalid")
    ) {
      return res.status(400).json({ error: "项目路径解析失败" });
    }
    const normalized = normalizeAIError(error);
    res.status(normalized.status || 500).json({
      error: normalized.message,
      code: normalized.code,
    });
  }
});

router.get("/summary/:projectName/:sessionId", (req, res) => {
  const { projectName, sessionId } = req.params;
  if (!projectName || !sessionId) {
    return res
      .status(400)
      .json({ error: "projectName and sessionId are required" });
  }
  try {
    const sessionFile = resolveSessionFile(projectName, sessionId);
    if (!sessionFile) {
      return res.status(404).json({ error: "未找到会话文件" });
    }
    const summary = loadSummary(sessionFile, sessionId);
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/summarize", async (req, res) => {
  const { projectName, sessionId, provider } = req.body || {};
  if (!projectName || !sessionId) {
    return res
      .status(400)
      .json({ error: "projectName and sessionId are required" });
  }

  const config = loadAIConfig();
  if (!config.privacyAccepted) {
    return res.status(403).json({ error: "请先同意隐私声明后再使用 AI 功能" });
  }

  try {
    const sessionFile = resolveSessionFile(projectName, sessionId);
    if (!sessionFile) {
      return res.status(404).json({ error: "未找到会话文件" });
    }
    if (!hasActualMessages(sessionFile)) {
      return res.status(404).json({ error: "会话没有可用于总结的对话内容" });
    }

    const messages = await loadSessionMessages(sessionFile);
    if (!messages.length) {
      return res.status(404).json({ error: "会话没有可用于总结的对话内容" });
    }

    const contextTokens = resolveContextTokens(
      provider || config.defaultProvider
    );
    const summaryContextTokens = Math.min(contextTokens, 8000);
    const sampled = buildSummaryMessages(messages, 5, 15);
    const trimmed = truncateMessagesByTokens(sampled, summaryContextTokens);
    const prompt = buildSummaryPrompt(formatConversation(trimmed));

    const aiService = getAIServiceManager();
    const result = await aiService.requestCompletion({
      providerKey: provider || config.defaultProvider,
      messages: [
        { role: "system", content: "你是擅长撰写对话摘要的助手。" },
        { role: "user", content: prompt },
      ],
      maxTokens: Math.min(summaryContextTokens, 800),
      temperature: 0.2,
      timeoutMs: 120000,
    });

    const summaryText = result.text?.trim();
    if (!summaryText) {
      return res.status(502).json({ error: "AI 返回内容为空" });
    }

    const saved = saveSummary(
      sessionFile,
      sessionId,
      summaryText,
      result.model ? `${result.provider}/${result.model}` : result.provider
    );

    res.json({
      success: true,
      data: saved,
    });
  } catch (error) {
    if (
      error?.message === "Invalid project path" ||
      error?.message?.includes("Invalid")
    ) {
      return res.status(400).json({ error: "项目路径解析失败" });
    }
    const normalized = normalizeAIError(error);
    res.status(normalized.status || 500).json({
      error: normalized.message,
      code: normalized.code,
    });
  }
});

module.exports = router;
