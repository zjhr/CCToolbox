const TOOL_CALL_REGEX = /\*\*\[调用工具:\s*([^\]]+)\]\*\*\s*```(?:json)?\n([\s\S]*?)```/g;
const TOOL_RESULT_REGEX = /\*\*\[工具结果\]\*\*\s*```(?:json)?\n([\s\S]*?)```/g;
const THINKING_REGEX = /\*\*\[(思考过程|思考|推理)(?::[^\]]*)?\]\*\*\n([\s\S]*?)(?=\n\*\*\[|\n---\n|$)/g;

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\n-{3,}\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeRole(message) {
  const raw = message?.type || message?.role;
  if (raw === 'user') return 'user';
  if (raw === 'tool') return 'tool';
  if (raw === 'thinking' || raw === 'reasoning') return 'thinking';
  return 'assistant';
}

function countMessageSegments(content, role, counts) {
  const normalized = (content || '').replace(/\r\n/g, '\n');
  const matches = [];

  for (const match of normalized.matchAll(TOOL_CALL_REGEX)) {
    matches.push({
      type: 'tool',
      start: match.index || 0,
      end: (match.index || 0) + match[0].length
    });
  }

  for (const match of normalized.matchAll(TOOL_RESULT_REGEX)) {
    matches.push({
      type: 'tool',
      start: match.index || 0,
      end: (match.index || 0) + match[0].length
    });
  }

  for (const match of normalized.matchAll(THINKING_REGEX)) {
    matches.push({
      type: 'thinking',
      start: match.index || 0,
      end: (match.index || 0) + match[0].length
    });
  }

  if (matches.length === 0) {
    if (cleanText(normalized)) {
      counts[role] += 1;
    }
    return;
  }

  matches.sort((a, b) => a.start - b.start);
  let cursor = 0;

  matches.forEach((match) => {
    if (match.start < cursor) return;
    if (match.start > cursor) {
      const text = normalized.slice(cursor, match.start);
      if (cleanText(text)) {
        counts[role] += 1;
      }
    }

    if (match.type === 'thinking') {
      counts.thinking += 1;
    } else {
      counts.tool += 1;
    }
    cursor = match.end;
  });

  if (cursor < normalized.length) {
    const text = normalized.slice(cursor);
    if (cleanText(text)) {
      counts[role] += 1;
    }
  }
}

function buildMessageCounts(messages = []) {
  const counts = {
    user: 0,
    assistant: 0,
    tool: 0,
    thinking: 0
  };

  if (!Array.isArray(messages)) return counts;

  messages.forEach((message) => {
    const role = normalizeRole(message);
    if (role === 'tool') {
      counts.tool += 1;
      return;
    }
    if (role === 'thinking') {
      counts.thinking += 1;
      return;
    }
    const content = typeof message?.content === 'string' ? message.content : '';
    countMessageSegments(content, role, counts);
  });

  return counts;
}

module.exports = {
  buildMessageCounts
};
