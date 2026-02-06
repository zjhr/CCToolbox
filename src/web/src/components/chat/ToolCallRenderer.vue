<template>
  <div v-if="toolCalls.length" class="tool-call-renderer">
    <div
      v-for="(call, index) in toolCalls"
      :key="getCallKey(call, index)"
      class="tool-call-card"
    >
      <div class="tool-call-header">
        <n-icon :component="ToolIcon" size="14" />
        <span class="tool-call-name">{{ call.name || '工具调用' }}</span>
        <span class="spacer"></span>
        <n-button
          v-if="shouldShowTaskDetail(call)"
          size="tiny"
          secondary
          class="task-detail-btn"
          @click="handleTaskClick(call)"
        >
          查看详情
        </n-button>
        <n-tag size="small" type="info" round>工具</n-tag>
      </div>

      <div class="tool-call-body">
        <div v-if="isTodoWrite(call.name)" class="todo-view">
          <div class="todo-list">
            <div
              v-for="(item, idx) in getTodoItems(call.input)"
              :key="`${index}-todo-${idx}`"
              class="todo-item"
              :class="{ done: item.done }"
            >
              <n-checkbox :checked="item.done" disabled>
                {{ item.text }}
              </n-checkbox>
            </div>
            <div v-if="getTodoItems(call.input).length === 0" class="empty-hint">暂无待办项</div>
          </div>
        </div>

        <div v-else-if="isAskUserQuestion(call.name)" class="question-view">
          <n-collapse-transition :show="!isListCollapsed('question', index, call)">
            <div>
              <div
                v-for="(question, qIndex) in getQuestionList(call.input ?? call.output)"
                :key="`${index}-question-${qIndex}`"
                class="question-card"
              >
                <div class="question-header">
                  <n-tag v-if="question.header" size="small" type="info" round>{{ question.header }}</n-tag>
                  <span class="question-title">{{ question.question || '-' }}</span>
                  <span v-if="question.multiSelect" class="question-hint">可多选</span>
                </div>
                <ul v-if="question.options.length" class="question-options">
                  <li v-for="(option, optIndex) in question.options" :key="`${index}-opt-${qIndex}-${optIndex}`">
                    <div class="option-label">{{ option.label }}</div>
                    <div v-if="option.description" class="option-desc">{{ option.description }}</div>
                  </li>
                </ul>
                <div v-else class="options-empty">暂无选项</div>
              </div>
            </div>
          </n-collapse-transition>
          <button
            v-if="shouldShowListToggle('question', call)"
            class="expand-btn"
            type="button"
            @click="toggleListCollapse('question', index, call)"
          >
            {{ isListCollapsed('question', index, call) ? '展开全部' : '收起' }}
          </button>
        </div>

        <div v-else-if="isUpdatePlan(call.name)" class="plan-view">
          <n-collapse-transition :show="!isListCollapsed('plan', index, call)">
            <div>
              <div v-if="getPlanExplanation(call)" class="plan-explanation">{{ getPlanExplanation(call) }}</div>
              <ul v-if="getPlanList(call).length" class="plan-list">
                <li
                  v-for="(item, planIndex) in getPlanList(call)"
                  :key="`${index}-plan-${planIndex}`"
                  class="plan-item"
                >
                  <span class="plan-status" :class="`plan-status--${getPlanStatus(item.status)}`">
                    {{ getPlanStatusLabel(item.status) }}
                  </span>
                  <span class="plan-step">{{ item.step }}</span>
                </li>
              </ul>
              <div v-else class="empty-hint">暂无计划</div>
            </div>
          </n-collapse-transition>
          <button
            v-if="shouldShowListToggle('plan', call)"
            class="expand-btn"
            type="button"
            @click="toggleListCollapse('plan', index, call)"
          >
            {{ isListCollapsed('plan', index, call) ? '展开全部' : '收起' }}
          </button>
        </div>

        <div v-else-if="isTerminalTool(call.name) || isToolResult(call.name)" class="terminal-view">
          <div class="terminal-title">{{ isToolResult(call.name) ? '工具输出' : '终端执行' }}</div>
          <pre v-if="getTerminalCommand(call.input)" class="terminal-line"><span class="prompt">$</span> {{ getTerminalCommandText(call, index) }}</pre>
          <div v-if="getTerminalOutput(call)" class="terminal-output-block">
            <n-collapse-transition :show="!isTerminalCollapsed(index, call)">
              <pre class="terminal-output">{{ getTerminalOutput(call) }}</pre>
            </n-collapse-transition>
            <pre v-if="isTerminalCollapsed(index, call)" class="terminal-output preview">
{{ truncateText(getTerminalOutput(call)) }}
            </pre>
          </div>
          <button
            v-if="shouldShowTerminalToggle(call)"
            class="expand-btn"
            type="button"
            @click="toggleTerminalCollapse(index, call)"
          >
            {{ isTerminalCollapsed(index, call) ? '展开全部' : '收起' }}
          </button>
        </div>

        <div v-else class="json-view">
          <div class="json-header">
            <span>JSON 详情</span>
          </div>
          <n-collapse-transition :show="!isCollapsed(index, call)">
            <div class="json-body">
              <div v-if="call.input !== undefined" class="json-block">
                <div class="json-title">输入</div>
                <pre>{{ formatJson(call.input) }}</pre>
              </div>
              <div v-if="call.output !== undefined" class="json-block">
                <div class="json-title">输出</div>
                <pre>{{ formatJson(call.output) }}</pre>
              </div>
            </div>
          </n-collapse-transition>
          <button
            v-if="shouldShowJsonToggle(call)"
            class="expand-btn"
            type="button"
            @click="toggleCollapse(index, call)"
          >
            {{ isCollapsed(index, call) ? '展开全部' : '收起' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { NCheckbox, NCollapseTransition, NTag, NIcon, NButton } from 'naive-ui'
import { BuildOutline as ToolIcon } from '@vicons/ionicons5'

const props = defineProps({
  toolCalls: {
    type: Array,
    default: () => []
  },
  progressEntries: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['click-task'])

const collapseStates = ref({})
const terminalCollapseStates = ref({})
const listCollapseStates = ref({})
const toolCalls = computed(() => props.toolCalls || [])
const progressEntries = computed(() => props.progressEntries || [])

function getCallKey(call, index) {
  return call?.id || `${call?.name || 'tool'}-${index}`
}

function isTodoWrite(name = '') {
  return name.toLowerCase().trim() === 'todowrite'
}

function isAskUserQuestion(name = '') {
  const normalized = String(name || '').toLowerCase().trim()
  const compact = normalized.replace(/[^a-z0-9]/g, '')
  return normalized === 'askuserquestion'
    || normalized === 'ask_user_question'
    || normalized === 'request_user_input'
    || normalized === 'requestuserinput'
    || compact === 'askuserquestion'
    || compact === 'requestuserinput'
}

function isUpdatePlan(name = '') {
  const normalized = name.toLowerCase().trim()
  return normalized === 'update_plan' || normalized === 'updateplan'
}

function isTaskTool(name = '') {
  return name.toLowerCase().trim() === 'task'
}

function isTerminalTool(name = '') {
  const normalized = name.toLowerCase().trim()
  return normalized.includes('bash')
    || normalized.includes('grep')
    || normalized.includes('run_command')
    || normalized.includes('runcommand')
    || normalized.includes('command')
    || normalized.includes('shell')
    || normalized.includes('powershell')
    || normalized.includes('cmd')
    || normalized.includes('terminal')
    || normalized.includes('exec')
}

function isToolResult(name = '') {
  return name === '工具结果'
}

function getTodoItems(input) {
  const data = normalizeData(input)
  const list = Array.isArray(data?.todos)
    ? data.todos
    : Array.isArray(data?.items)
      ? data.items
      : []
  return list.map((item) => {
    if (typeof item === 'string') {
      return { text: item, done: false }
    }
    return {
      text: item.content || item.text || item.title || '未命名待办',
      done: Boolean(item.done || item.checked || item.completed || item.status === 'completed')
    }
  })
}

function getQuestionList(input) {
  const data = normalizeData(input)
  const rawText = typeof input === 'string' ? input : data?.raw

  // 优先级: input.questions > payload.questions > data.questions > questions
  const nestedQuestions = Array.isArray(data?.input?.questions)
    ? data.input.questions
    : Array.isArray(data?.payload?.questions)
      ? data.payload.questions
      : Array.isArray(data?.data?.questions)
        ? data.data.questions
        : null

  const questions = Array.isArray(data?.questions) ? data.questions : nestedQuestions
  const baseList = questions?.length ? questions : [data]

  const normalized = (baseList || [])
    .filter(Boolean)
    .map((item) => {
      const inner = item?.input || item?.payload || item?.data || null
      return {
        header: item?.header || item?.title || '',
        question: item?.question || item?.prompt || item?.text || inner?.question || inner?.prompt || inner?.text || '',
        options: normalizeOptions(item?.options || item?.choices || item?.answers || inner?.options || inner?.choices || []),
        multiSelect: Boolean(item?.multiSelect || item?.multiple || inner?.multiSelect)
      }
    })
    .filter((item) => item.question || item.options.length)

  if (normalized.length > 0) return normalized

  return [{
    header: '',
    question: rawText || '',
    options: [],
    multiSelect: false
  }]
}

function getPlanData(call) {
  return normalizeData(call?.input ?? call?.output) || {}
}

function getPlanExplanation(call) {
  const data = getPlanData(call)
  return data?.explanation || data?.summary || ''
}

function getPlanList(call) {
  const data = getPlanData(call)
  const plan = Array.isArray(data?.plan) ? data.plan : Array.isArray(data) ? data : []
  return plan
    .map((item) => ({
      step: item?.step || item?.title || item?.text || '',
      status: item?.status || 'pending'
    }))
    .filter((item) => item.step)
}

function extractAgentId(source) {
  if (!source || typeof source !== 'object') return ''
  return source.agentId
    || source.agent_id
    || source?.data?.agentId
    || source?.data?.agent_id
    || source?.result?.agentId
    || source?.result?.agent_id
    || source?.output?.agentId
    || source?.output?.agent_id
    || source?.progress?.agentId
    || source?.progress?.agent_id
    || ''
}

function extractPrompt(source) {
  if (!source || typeof source !== 'object') return ''
  return source.prompt
    || source.task
    || source.question
    || source?.input?.prompt
    || source?.input?.task
    || source?.data?.prompt
    || ''
}

function extractSubagentType(source) {
  if (!source || typeof source !== 'object') return ''
  return source.subagentType
    || source.subagent_type
    || source.agentType
    || source.agent_type
    || source?.data?.subagentType
    || source?.data?.subagent_type
    || ''
}

function normalizeText(value) {
  return String(value || '').trim()
}

function findProgressMatch(prompt, subagentType) {
  const entries = progressEntries.value
  if (!Array.isArray(entries) || entries.length === 0) return null
  const normalizedPrompt = normalizeText(prompt)
  const normalizedType = normalizeText(subagentType)
  let best = null
  let bestScore = 0

  entries.forEach((entry) => {
    if (!entry || !entry.agentId) return
    let score = 0
    const toolName = normalizeText(entry.toolName).toLowerCase()
    if (toolName === 'task') score += 1
    const entryPrompt = normalizeText(entry.prompt)
    if (normalizedPrompt && entryPrompt) {
      if (entryPrompt === normalizedPrompt) {
        score += 3
      } else if (entryPrompt.includes(normalizedPrompt) || normalizedPrompt.includes(entryPrompt)) {
        score += 1
      }
    }
    const entryType = normalizeText(entry.subagentType)
    if (normalizedType && entryType && entryType === normalizedType) {
      score += 2
    }
    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  })

  if (!best && entries.length === 1 && entries[0]?.agentId) {
    return entries[0]
  }

  return best
}

function getTaskInfo(call) {
  const input = normalizeData(call?.input)
  const output = normalizeData(call?.output)
  let agentId = extractAgentId(input) || extractAgentId(output)
  let prompt = extractPrompt(input) || extractPrompt(output)
  let subagentType = extractSubagentType(input) || extractSubagentType(output)

  if (!agentId || !prompt || !subagentType) {
    const progressMatch = findProgressMatch(prompt, subagentType)
    if (progressMatch) {
      agentId = agentId || progressMatch.agentId
      prompt = prompt || progressMatch.prompt
      subagentType = subagentType || progressMatch.subagentType
    }
  }

  return {
    agentId: agentId || '',
    prompt: prompt || '',
    subagentType: subagentType || ''
  }
}

function shouldShowTaskDetail(call) {
  if (!isTaskTool(call?.name)) return false
  const info = getTaskInfo(call)
  return Boolean(info.agentId)
}

function handleTaskClick(call) {
  const info = getTaskInfo(call)
  if (!info.agentId) return
  emit('click-task', info)
}

function getPlanStatus(status) {
  const normalized = String(status || 'pending').toLowerCase()
  if (normalized === 'completed') return 'completed'
  if (normalized === 'in_progress' || normalized === 'in-progress' || normalized === 'progress') return 'in-progress'
  if (normalized === 'blocked') return 'blocked'
  return 'pending'
}

function getPlanStatusLabel(status) {
  const normalized = getPlanStatus(status)
  if (normalized === 'completed') return '已完成'
  if (normalized === 'in-progress') return '进行中'
  if (normalized === 'blocked') return '阻塞'
  return '待处理'
}

function normalizeOptions(options) {
  if (!Array.isArray(options) || options.length === 0) return []
  return options.map((item) => {
    if (typeof item === 'string' || typeof item === 'number') {
      return { label: String(item), description: '' }
    }
    if (!item || typeof item !== 'object') {
      return { label: String(item || ''), description: '' }
    }
    return {
      label: item.label || item.text || item.value || '未命名选项',
      description: item.description || item.desc || ''
    }
  })
}

function getTerminalCommand(input) {
  if (!input) return ''
  if (typeof input === 'string') return input
  return input.command || input.query || input.pattern || ''
}

function getTerminalCommandText(call, index) {
  const command = getTerminalCommand(call?.input)
  if (!command) return ''
  if (isTerminalCollapsed(index, call)) {
    return truncateText(command)
  }
  return command
}

function formatTerminalOutput(output) {
  if (output === undefined || output === null) return ''
  if (typeof output === 'string') return output.trim()
  if (typeof output === 'number' || typeof output === 'boolean') return String(output)
  return formatJson(output)
}

function getTerminalOutput(call) {
  const direct = extractOutputText(call?.output)
  if (direct !== '') return direct
  const fallback = extractOutputText(call?.input?.output ?? call?.input?.result ?? call?.input?.content ?? call?.input?.data)
  return fallback
}

function extractOutputText(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return formatJson(value)
  if (typeof value === 'object') {
    if (value.output !== undefined) return extractOutputText(value.output)
    if (value.content !== undefined) return extractOutputText(value.content)
    if (value.result !== undefined) return extractOutputText(value.result)
    if (value.data !== undefined) return extractOutputText(value.data)
    if (value.message !== undefined) return extractOutputText(value.message)
    if (value.stdout !== undefined) return extractOutputText(value.stdout)
    if (value.stderr !== undefined) return extractOutputText(value.stderr)
    if (value.logs !== undefined) return extractOutputText(value.logs)
    return formatJson(value)
  }
  return String(value)
}

function normalizeData(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch (err) {
      return { raw: data }
    }
  }
  return data
}

function formatJson(data) {
  if (data === undefined || data === null) return ''
  if (typeof data === 'string') return data.trim()
  try {
    return JSON.stringify(data, null, 2)
  } catch (err) {
    return String(data)
  }
}

function shouldCollapse(data) {
  const jsonStr = formatJson(data)
  return jsonStr.split('\n').length > 3 || jsonStr.length > 180
}

function shouldCollapseText(text) {
  return isTextTruncated(text)
}

function shouldCollapseTerminal(call) {
  return isTextTruncated(getTerminalCommand(call?.input))
    || isTextTruncated(getTerminalOutput(call))
}

function shouldShowTerminalToggle(call) {
  return shouldCollapseTerminal(call)
}

function shouldCollapseList(items, maxCount = 2, maxChars = 120) {
  if (!Array.isArray(items)) return false
  const totalChars = items.reduce((sum, item) => {
    const text = item?.text || item?.label || item?.question || ''
    return sum + String(text).length
  }, 0)
  const maxItemLen = items.reduce((maxLen, item) => {
    const text = item?.text || item?.label || item?.question || ''
    return Math.max(maxLen, String(text).length)
  }, 0)
  return items.length > maxCount || totalChars > maxChars || maxItemLen > 120
}

function shouldCollapseQuestions(questions) {
  if (!Array.isArray(questions)) return false
  const optionCount = questions.reduce((sum, item) => sum + (item?.options?.length || 0), 0)
  const textChars = questions.reduce((sum, item) => {
    const base = item?.question || ''
    const optionText = (item?.options || []).reduce((acc, opt) => {
      const label = opt?.label || ''
      const desc = opt?.description || opt?.desc || ''
      return acc + String(label).length + String(desc).length
    }, 0)
    return sum + String(base).length + optionText
  }, 0)
  return questions.length > 1 || optionCount > 2 || textChars > 160
}

function shouldCollapsePlan(items) {
  if (!Array.isArray(items)) return false
  const totalChars = items.reduce((sum, item) => sum + String(item?.step || '').length, 0)
  return items.length > 4 || totalChars > 240
}

function isCollapsed(index, call) {
  const key = getCallKey(call, index)
  return Boolean(collapseStates.value[key])
}

function toggleCollapse(index, call) {
  const key = getCallKey(call, index)
  const collapseTarget = getCollapseTarget(call)
  if (collapseStates.value[key] === undefined) {
    collapseStates.value[key] = shouldCollapse(collapseTarget)
  }
  collapseStates.value[key] = !collapseStates.value[key]
}

function shouldShowJsonToggle(call) {
  return shouldCollapse(call?.input) || shouldCollapse(call?.output)
}

function getCollapseTarget(call) {
  if (!call) return null
  const inputText = formatJson(call.input)
  const outputText = formatJson(call.output)
  if (!outputText) return call.input
  if (!inputText) return call.output
  return outputText.length > inputText.length ? call.output : call.input
}

function getListKey(prefix, call, index) {
  return `${prefix}-${getCallKey(call, index)}`
}

function isListCollapsed(prefix, index, call) {
  const key = getListKey(prefix, call, index)
  return Boolean(listCollapseStates.value[key])
}

function toggleListCollapse(prefix, index, call) {
  const key = getListKey(prefix, call, index)
  if (listCollapseStates.value[key] === undefined) {
    listCollapseStates.value[key] = true
  }
  listCollapseStates.value[key] = !listCollapseStates.value[key]
}

function shouldShowListToggle(prefix, call) {
  if (prefix === 'todo') {
    return shouldCollapseList(getTodoItems(call?.input))
  }
  if (prefix === 'question') {
    return shouldCollapseQuestions(getQuestionList(call?.input ?? call?.output))
  }
  if (prefix === 'plan') {
    return shouldCollapsePlan(getPlanList(call))
  }
  return false
}

function getTerminalKey(call, index) {
  return `terminal-${getCallKey(call, index)}`
}

function isTerminalCollapsed(index, call) {
  const key = getTerminalKey(call, index)
  return Boolean(terminalCollapseStates.value[key])
}

function toggleTerminalCollapse(index, call) {
  const key = getTerminalKey(call, index)
  const output = getTerminalOutput(call)
  if (terminalCollapseStates.value[key] === undefined) {
    terminalCollapseStates.value[key] = shouldCollapseTerminal(call)
  }
  terminalCollapseStates.value[key] = !terminalCollapseStates.value[key]
}

function truncateText(text, maxLines = 2, maxChars = 120) {
  if (!text) return ''
  const lines = text.split('\n')
  if (lines.length > maxLines) {
    return `${lines.slice(0, maxLines).join('\n')}\n...`
  }
  if (text.length > maxChars) {
    return text.substring(0, maxChars) + '...'
  }
  return text
}

function isTextTruncated(text, maxLines = 2, maxChars = 120) {
  if (!text) return false
  return truncateText(text, maxLines, maxChars) !== text
}

watch(
  () => props.toolCalls,
  (calls) => {
    const nextStates = {}
    const nextTerminalStates = {}
    const nextListStates = {}
    ;(calls || []).forEach((call, index) => {
      const key = getCallKey(call, index)
      if (collapseStates.value[key] !== undefined) {
        nextStates[key] = collapseStates.value[key]
      } else {
        const collapseTarget = call?.input !== undefined ? call.input : call?.output
        nextStates[key] = shouldCollapse(collapseTarget)
      }

      const terminalKey = getTerminalKey(call, index)
      if (terminalCollapseStates.value[terminalKey] !== undefined) {
        nextTerminalStates[terminalKey] = terminalCollapseStates.value[terminalKey]
      } else {
        nextTerminalStates[terminalKey] = shouldCollapseTerminal(call)
      }

      if (isTodoWrite(call?.name)) {
        const todoKey = getListKey('todo', call, index)
        if (listCollapseStates.value[todoKey] !== undefined) {
          nextListStates[todoKey] = listCollapseStates.value[todoKey]
        } else {
          nextListStates[todoKey] = shouldCollapseList(getTodoItems(call?.input))
        }
      }

      if (isAskUserQuestion(call?.name)) {
        const questionKey = getListKey('question', call, index)
        if (listCollapseStates.value[questionKey] !== undefined) {
          nextListStates[questionKey] = listCollapseStates.value[questionKey]
        } else {
          nextListStates[questionKey] = shouldCollapseQuestions(getQuestionList(call?.input ?? call?.output))
        }
      }

      if (isUpdatePlan(call?.name)) {
        const planKey = getListKey('plan', call, index)
        if (listCollapseStates.value[planKey] !== undefined) {
          nextListStates[planKey] = listCollapseStates.value[planKey]
        } else {
          nextListStates[planKey] = shouldCollapsePlan(getPlanList(call))
        }
      }
    })
    collapseStates.value = nextStates
    terminalCollapseStates.value = nextTerminalStates
    listCollapseStates.value = nextListStates
  },
  { immediate: true }
)
</script>

<style scoped>
.tool-call-renderer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-call-card {
  border: 1px solid #3b82f630;
  border-radius: 8px;
  background: var(--n-color);
  overflow: hidden;
}

.tool-call-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--n-border-color);
  background: rgba(59, 130, 246, 0.08);
  color: #2563eb;
}

.tool-call-name {
  font-weight: 600;
  font-size: 12px;
}

.task-detail-btn {
  padding: 0 8px;
}

.tool-call-body {
  padding: 12px;
  font-size: 13px;
  color: var(--n-text-color);
}

.spacer {
  flex: 1;
}

.todo-view {
  border-radius: 10px;
  padding: 12px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(14, 165, 233, 0.12));
  border: 1px solid rgba(59, 130, 246, 0.35);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #bfdbfe;
  font-weight: 600;
  color: #0f172a;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  overflow-wrap: anywhere;
  border-left: 3px solid #3b82f6;
}

.todo-item:not(.done) {
  background: #eff6ff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.18);
}

.todo-item.done {
  background: #ecfdf3;
  border-color: #86efac;
  border-left-color: #22c55e;
  color: #166534;
  text-decoration: line-through;
  font-weight: 500;
}

.todo-item :deep(.n-checkbox) {
  opacity: 1;
}

.todo-item :deep(.n-checkbox__label) {
  color: inherit;
  font-weight: inherit;
  line-height: 1.4;
}

.todo-item.done :deep(.n-checkbox__label) {
  color: #166534;
}

.empty-hint {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.question-card {
  padding: 10px;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  background: var(--n-color-embedded);
  margin-bottom: 10px;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.question-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--n-text-color);
}

.question-title {
  font-weight: 600;
}

.question-hint {
  font-size: 11px;
  color: var(--n-text-color-3);
}

.question-options {
  margin: 0;
  padding-left: 16px;
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--n-text-color-1);
  word-break: break-word;
  overflow-wrap: anywhere;
}

.plan-view {
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.plan-explanation {
  font-size: 12px;
  color: var(--n-text-color-2);
  margin-bottom: 8px;
  line-height: 1.5;
}

.plan-list {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  list-style: none;
}

.plan-item {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  font-size: 12px;
  line-height: 1.4;
  color: #0f172a;
}

.plan-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #0f172a;
  background: #e2e8f0;
}

.plan-status--completed {
  background: #dcfce7;
  color: #166534;
}

.plan-status--in-progress {
  background: #e0f2fe;
  color: #0c4a6e;
}

.plan-status--blocked {
  background: #fee2e2;
  color: #991b1b;
}

.plan-status--pending {
  background: #fef9c3;
  color: #854d0e;
}

.plan-step {
  word-break: break-word;
  overflow-wrap: anywhere;
}

.question-options li {
  list-style: disc;
}

.option-label {
  font-weight: 500;
}

.option-desc {
  font-size: 11px;
  color: var(--n-text-color-3);
  margin-top: 2px;
}

.options-empty {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.terminal-view {
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 10px 12px;
  font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
}

.terminal-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #93c5fd;
  margin-bottom: 6px;
}

.terminal-line,
.terminal-output {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.terminal-output.preview {
  opacity: 0.8;
}

.terminal-output-block {
  margin-top: 6px;
}

.terminal-line + .terminal-output {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(148, 163, 184, 0.4);
}

.prompt {
  color: #22c55e;
  margin-right: 6px;
}

.json-view {
  border: 1px dashed var(--n-border-color);
  border-radius: 6px;
  padding: 10px;
}

.json-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--n-text-color-2);
  margin-bottom: 6px;
}

.json-body pre {
  margin: 0;
  padding: 8px;
  border-radius: 6px;
  background: var(--n-code-color);
  overflow-x: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  font-size: 12px;
}

.expand-btn {
  margin-top: 8px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--n-primary-color);
  cursor: pointer;
  text-align: center;
  border-radius: 4px;
  background: transparent;
  border: none;
  width: 100%;
}

.expand-btn:hover {
  background: var(--n-color-embedded);
}

.json-block + .json-block {
  margin-top: 10px;
}

.json-title {
  font-size: 11px;
  color: var(--n-text-color-3);
  margin-bottom: 4px;
}
</style>
