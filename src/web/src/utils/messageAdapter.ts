export type BackendSource = 'claude' | 'codex' | 'gemini'
export type MessageRole = 'user' | 'assistant' | 'tool' | 'thinking'

export interface ToolCall {
  name: string
  input: any
  output?: any
}

export interface UnifiedMessage {
  id: string
  role: MessageRole
  model?: BackendSource
  content: any
  toolCalls?: ToolCall[]
  timestamp: number | null
  agentId?: string | null
  slug?: string | null
}

export interface SubagentMessage {
  id?: string
  type?: string
  role?: MessageRole
  content: any
  timestamp?: number | null
  model?: BackendSource
  agentId?: string | null
  slug?: string | null
}

const TOOL_CALL_REGEX = /\*\*\[调用工具:\s*([^\]]+)\]\*\*\s*```(?:json)?\n([\s\S]*?)```/g
const TOOL_RESULT_REGEX = /\*\*\[工具结果\]\*\*\s*```(?:json)?\n([\s\S]*?)```/g
const THINKING_REGEX = /\*\*\[(思考过程|思考|推理)(?::[^\]]*)?\]\*\*\n([\s\S]*?)(?=\n\*\*\[|\n---\n|$)/g

interface ExtractedBlock {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking'
  start: number
  end: number
  data?: any
}

const messageIdMap = new WeakMap<object, string>()
let messageIdSeed = 0

export function adaptMessages(rawMessages: any[], backend: BackendSource): UnifiedMessage[] {
  if (!Array.isArray(rawMessages)) return []
  const results: UnifiedMessage[] = []

  rawMessages.forEach((message, index) => {
    const role = normalizeRole(message)
    const model = normalizeModel(message?.model, backend)
    const timestamp = message?.timestamp ?? null
    const content = normalizeContent(message?.content)
    const extraFields = extractExtraFields(message)
    const baseId = createMessageId(message, index, content, role, model)

    if (Array.isArray(content)) {
      results.push({
        id: `${baseId}-0`,
        role,
        model,
        content,
        timestamp,
        ...extraFields
      })
      return
    }

    const blocks = extractBlocks(content)
    if (blocks.length === 0) {
      const cleaned = cleanText(content)
      if (cleaned) {
        results.push({
          id: `${baseId}-0`,
          role,
          model,
          content: cleaned,
          timestamp,
          ...extraFields
        })
      }
      return
    }

    let buffer = ''
    let blockIndex = 0

    const flushBuffer = () => {
      const cleaned = cleanText(buffer)
      if (cleaned) {
        results.push({
          id: `${baseId}-text-${blockIndex++}`,
          role,
          model,
          content: cleaned,
          timestamp,
          ...extraFields
        })
      }
      buffer = ''
    }

    blocks.forEach((block) => {
      if (block.type === 'text') {
        buffer += block.data || ''
        return
      }

      flushBuffer()

      if (block.type === 'tool_call') {
        results.push({
          id: `${baseId}-tool-${blockIndex++}`,
          role: 'tool',
          model,
          content: '',
          toolCalls: [block.data],
          timestamp,
          ...extraFields
        })
        return
      }

      if (block.type === 'tool_result') {
        results.push({
          id: `${baseId}-tool-${blockIndex++}`,
          role: 'tool',
          model,
          content: '',
          toolCalls: [block.data],
          timestamp,
          ...extraFields
        })
        return
      }

      if (block.type === 'thinking') {
        results.push({
          id: `${baseId}-thinking-${blockIndex++}`,
          role: 'thinking',
          model,
          content: cleanText(block.data),
          timestamp,
          ...extraFields
        })
      }
    })

    flushBuffer()
  })

  return results
}

function createMessageId(
  message: any,
  index: number,
  content: string | any[],
  role: MessageRole,
  model: BackendSource
): string {
  if (message?.id) return String(message.id)
  if (message && typeof message === 'object') {
    const existing = messageIdMap.get(message)
    if (existing) return existing
  }
  const timestamp = message?.timestamp ?? 't'
  const digest = hashString(getContentPreview(content))
  const modelTag = model || 'm'
  const seed = messageIdSeed += 1
  const created = `${role}-${timestamp}-${modelTag}-${seed}-${index}-${digest || 'x'}`
  if (message && typeof message === 'object') {
    messageIdMap.set(message, created)
  }
  return created
}

function getContentPreview(content: string | any[]): string {
  if (Array.isArray(content)) {
    try {
      return JSON.stringify(content).slice(0, 200)
    } catch (err) {
      return String(content).slice(0, 200)
    }
  }
  if (typeof content === 'string') return content.slice(0, 200)
  if (content === null || content === undefined) return ''
  try {
    return JSON.stringify(content).slice(0, 200)
  } catch (err) {
    return String(content).slice(0, 200)
  }
}

function hashString(value: string): string {
  if (!value) return ''
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function extractExtraFields(message: any): { agentId?: string | null; slug?: string | null } {
  if (!message || typeof message !== 'object') return {}
  const agentId = message.agentId || message.agent_id || message?.data?.agentId || message?.data?.agent_id || null
  const slug = message.slug || message?.data?.slug || null
  const extra: { agentId?: string | null; slug?: string | null } = {}
  if (agentId) extra.agentId = agentId
  if (slug) extra.slug = slug
  return extra
}

function normalizeRole(message: any): MessageRole {
  const raw = message?.role || message?.type
  if (raw === 'user' || raw === 'assistant' || raw === 'tool' || raw === 'thinking') {
    return raw
  }
  if (raw === 'tool_call' || raw === 'tool_output') return 'tool'
  if (raw === 'reasoning') return 'thinking'
  return 'assistant'
}

function normalizeModel(model: string | null, fallback: BackendSource): BackendSource {
  if (!model) return fallback
  const normalized = model.toLowerCase()
  if (normalized.includes('claude') || normalized.includes('anthropic')) return 'claude'
  if (normalized.includes('gemini')) return 'gemini'
  if (normalized.includes('gpt') || normalized.includes('openai') || normalized.includes('codex')) return 'codex'
  return fallback
}

function normalizeContent(content: any): string | any[] {
  if (Array.isArray(content)) return content
  if (typeof content === 'string') return content
  if (content === null || content === undefined) return ''
  try {
    return JSON.stringify(content, null, 2)
  } catch (err) {
    return String(content)
  }
}

function extractBlocks(content: string): ExtractedBlock[] {
  const normalized = (content || '').replace(/\r\n/g, '\n')
  const matches: ExtractedBlock[] = []

  for (const match of normalized.matchAll(TOOL_CALL_REGEX)) {
    matches.push({
      type: 'tool_call',
      start: match.index || 0,
      end: (match.index || 0) + match[0].length,
      data: {
        name: (match[1] || '').trim(),
        input: parseJson(match[2])
      }
    })
  }

  for (const match of normalized.matchAll(TOOL_RESULT_REGEX)) {
    matches.push({
      type: 'tool_result',
      start: match.index || 0,
      end: (match.index || 0) + match[0].length,
      data: {
        name: '工具结果',
        input: null,
        output: parseJson(match[1])
      }
    })
  }

  for (const match of normalized.matchAll(THINKING_REGEX)) {
    matches.push({
      type: 'thinking',
      start: match.index || 0,
      end: (match.index || 0) + match[0].length,
      data: match[2] || ''
    })
  }

  if (matches.length === 0) return []

  matches.sort((a, b) => a.start - b.start)
  const blocks: ExtractedBlock[] = []
  let cursor = 0

  matches.forEach((match) => {
    if (match.start < cursor) return
    if (match.start > cursor) {
      blocks.push({
        type: 'text',
        start: cursor,
        end: match.start,
        data: normalized.slice(cursor, match.start)
      })
    }
    blocks.push(match)
    cursor = match.end
  })

  if (cursor < normalized.length) {
    blocks.push({
      type: 'text',
      start: cursor,
      end: normalized.length,
      data: normalized.slice(cursor)
    })
  }

  return blocks
}

function parseJson(value: string): any {
  if (!value) return ''
  const raw = value.trim()
  try {
    return JSON.parse(raw)
  } catch (err) {
    return raw
  }
}

function cleanText(text: string): string {
  if (!text) return ''
  return text
    .replace(/\n-{3,}\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
