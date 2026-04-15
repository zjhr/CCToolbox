const UNKNOWN_WINDOW_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_WINDOW_THRESHOLD = 200;

let unknownWindowStartAt = Date.now();
let unknownWindowCount = 0;

/**
 * 将任意值安全转成可展示文本
 * @param {any} value 任意输入
 * @returns {string}
 */
function toSafeText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return String(value);
  }
}

/**
 * 统一提取 parts 数组里的文本
 * @param {Array<any>} parts 片段数组
 * @returns {{ text: string, unknown: boolean }}
 */
function extractTextParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    return { text: '', unknown: false };
  }

  let unknown = false;
  const text = parts.map((part) => {
    if (typeof part === 'string') return part;
    if (part === null || part === undefined) return '';
    if (typeof part !== 'object') return toSafeText(part);

    if (typeof part.text === 'string') return part.text;
    if (typeof part.content === 'string') return part.content;

    if (Array.isArray(part.parts)) {
      const nested = extractTextParts(part.parts);
      unknown = unknown || nested.unknown;
      return nested.text;
    }

    unknown = true;
    return toSafeText(part);
  }).filter(Boolean).join('\n');

  return { text, unknown };
}

/**
 * 归一化 Gemini 消息内容，输出稳定文本
 * @param {object} message Gemini 原始消息
 * @returns {{ normalizedText: string, rawContent: any, isUnknownStructure: boolean, unknownReason: string|null }}
 */
function normalizeGeminiMessageContent(message) {
  const rawContent = message && Object.prototype.hasOwnProperty.call(message, 'content')
    ? message.content
    : undefined;

  let normalizedText = '';
  let isUnknownStructure = false;
  let unknownReason = null;

  if (typeof rawContent === 'string') {
    normalizedText = rawContent;
  } else if (Array.isArray(rawContent)) {
    const extracted = extractTextParts(rawContent);
    normalizedText = extracted.text;
    if (!normalizedText && rawContent.length > 0) {
      isUnknownStructure = true;
      unknownReason = 'content_array_no_text';
    } else {
      isUnknownStructure = extracted.unknown;
      unknownReason = extracted.unknown ? 'content_array_partial_unknown' : null;
    }
  } else if (rawContent && typeof rawContent === 'object') {
    if (typeof rawContent.text === 'string') {
      normalizedText = rawContent.text;
    } else if (typeof rawContent.content === 'string') {
      normalizedText = rawContent.content;
    } else if (Array.isArray(rawContent.parts)) {
      const extracted = extractTextParts(rawContent.parts);
      normalizedText = extracted.text;
      if (!normalizedText && rawContent.parts.length > 0) {
        isUnknownStructure = true;
        unknownReason = 'content_object_parts_no_text';
      } else {
        isUnknownStructure = extracted.unknown;
        unknownReason = extracted.unknown ? 'content_object_parts_partial_unknown' : null;
      }
    } else {
      normalizedText = toSafeText(rawContent);
      isUnknownStructure = true;
      unknownReason = 'content_object_unrecognized';
    }
  } else if (Array.isArray(message?.parts)) {
    const extracted = extractTextParts(message.parts);
    normalizedText = extracted.text;
    if (!normalizedText && message.parts.length > 0) {
      isUnknownStructure = true;
      unknownReason = 'message_parts_no_text';
    } else {
      isUnknownStructure = extracted.unknown;
      unknownReason = extracted.unknown ? 'message_parts_partial_unknown' : null;
    }
  } else if (typeof message?.text === 'string') {
    normalizedText = message.text;
  } else if (rawContent !== null && rawContent !== undefined) {
    normalizedText = toSafeText(rawContent);
    isUnknownStructure = true;
    unknownReason = 'content_primitive_unexpected';
  }

  normalizedText = typeof normalizedText === 'string'
    ? normalizedText.trim()
    : toSafeText(normalizedText).trim();

  if (!normalizedText) {
    normalizedText = '[空消息]';
  }

  return {
    normalizedText,
    rawContent,
    isUnknownStructure,
    unknownReason
  };
}

function resetUnknownWindowIfNeeded(nowMs) {
  if (nowMs - unknownWindowStartAt <= UNKNOWN_WINDOW_MS) {
    return;
  }
  unknownWindowStartAt = nowMs;
  unknownWindowCount = 0;
}

/**
 * 记录 unknown 结构命中，便于后续扩展映射
 * @param {{ sessionId: string, messageIndex: number, messageType: string, unknownReason: string|null }} payload
 */
function recordGeminiUnknownShape(payload) {
  const nowMs = Date.now();
  resetUnknownWindowIfNeeded(nowMs);
  unknownWindowCount += 1;

  const { sessionId, messageIndex, messageType, unknownReason } = payload || {};
  console.warn(
    `[Gemini API] Unknown message content shape: sessionId=${sessionId || 'unknown'}, messageIndex=${messageIndex}, messageType=${messageType || 'unknown'}, reason=${unknownReason || 'unknown'}`
  );

  if (unknownWindowCount % UNKNOWN_WINDOW_THRESHOLD === 0) {
    console.warn(
      `[Gemini API] Unknown message content count in recent 24h reached ${unknownWindowCount}`
    );
  }
}

function __resetUnknownShapeCounterForTest() {
  unknownWindowStartAt = Date.now();
  unknownWindowCount = 0;
}

module.exports = {
  normalizeGeminiMessageContent,
  extractTextParts,
  toSafeText,
  recordGeminiUnknownShape,
  __resetUnknownShapeCounterForTest
};
