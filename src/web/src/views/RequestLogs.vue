<template>
  <main class="request-logs-page">
    <header class="page-header">
      <div>
        <n-button text @click="goBack"><template #icon><n-icon><ArrowBackOutline /></n-icon></template>返回</n-button>
        <h2>详细调用日志</h2>
        <p>查看 Claude、Codex 与 Gemini 已完成的代理调用元数据。</p>
      </div>
      <div class="refresh-controls">
        <n-switch v-model:value="autoRefresh"><template #checked>自动刷新</template><template #unchecked>手动刷新</template></n-switch>
        <n-select v-model:value="refreshSeconds" :options="refreshOptions" class="refresh-select" />
        <n-button :loading="loading" @click="loadLogs">刷新</n-button>
      </div>
    </header>

    <n-card :bordered="false" class="surface">
      <div class="filters">
        <n-select v-model:value="filters.toolType" :options="toolOptions" placeholder="工具类型" clearable />
        <n-date-picker v-model:value="dateRange" type="daterange" class="date-picker" clearable />
        <n-select v-model:value="filters.success" :options="successOptions" placeholder="状态" clearable />
        <n-select v-model:value="filters.channel" :options="channelOptions" placeholder="渠道" clearable filterable />
        <n-select v-model:value="filters.model" :options="modelOptions" placeholder="模型" clearable filterable />
        <n-button type="primary" @click="applyFilters">查询</n-button>
      </div>
    </n-card>

    <section class="summary-grid">
      <n-card v-for="card in summaryCards" :key="card.label" size="small" :bordered="false" class="surface summary-card"><span>{{ card.label }}</span><strong>{{ card.value }}</strong></n-card>
    </section>

    <section class="breakdowns">
      <n-card title="Top 渠道" size="small" :bordered="false" class="surface"><Breakdown :items="summary.topChannels" /></n-card>
      <n-card title="Top 模型" size="small" :bordered="false" class="surface"><Breakdown :items="summary.topModels" /></n-card>
    </section>

    <n-card :bordered="false" class="surface table-card">
      <n-data-table :columns="columns" :data="logs" :loading="loading" :row-key="row => row.id" :pagination="false" :scroll-x="1160" />
      <div class="pagination-row"><span>共 {{ pagination.total }} 条，固定每页 50 条</span><n-pagination v-model:page="filters.page" :page-count="pagination.totalPages" @update:page="loadLogs" /></div>
    </n-card>
  </main>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowBackOutline } from '@vicons/ionicons5'
import { NButton, NCard, NDataTable, NDatePicker, NEmpty, NIcon, NPagination, NSelect, NSwitch, NTag } from 'naive-ui'
import { getRequestLogs } from '../api/statistics'
import message from '../utils/message'

const route = useRoute()
const router = useRouter()
const today = new Date()
const sevenDaysAgo = new Date(today)
sevenDaysAgo.setDate(today.getDate() - 6)
const filters = ref({ toolType: route.query.toolType || null, success: route.query.success === 'true' ? true : route.query.success === 'false' ? false : null, channel: route.query.channel || null, model: route.query.model || null, page: Math.max(1, Number(route.query.page) || 1) })
const dateRange = ref([fromQuery(route.query.from) || sevenDaysAgo.getTime(), fromQuery(route.query.to) || today.getTime()])
const logs = ref([])
const loading = ref(false)
const autoRefresh = ref(true)
const refreshSeconds = ref(5)
const filterOptions = ref({ channels: [], models: [] })
const summary = ref({ requests: 0, tokens: 0, cost: 0, successful: 0, failed: 0, topChannels: [], topModels: [] })
const pagination = ref({ page: 1, total: 0, totalPages: 1 })
let refreshTimer = null

const refreshOptions = [5, 10, 15, 30, 60].map(value => ({ label: value + ' 秒', value }))
const toolOptions = [{ label: 'Claude', value: 'claude-code' }, { label: 'Codex', value: 'codex' }, { label: 'Gemini', value: 'gemini' }]
const successOptions = [{ label: '成功', value: true }, { label: '失败', value: false }]
const channelOptions = computed(() => filterOptions.value.channels.map(value => ({ label: value, value })))
const modelOptions = computed(() => filterOptions.value.models.map(value => ({ label: value, value })))
const summaryCards = computed(() => [
  { label: '匹配请求', value: number(summary.value.requests) }, { label: '总 Tokens', value: number(summary.value.tokens) },
  { label: '总成本', value: cost(summary.value.cost) }, { label: '成功 / 失败', value: summary.value.successful + ' / ' + summary.value.failed }
])

const Breakdown = defineComponent({
  props: { items: { type: Array, default: () => [] } },
  setup(props) { return () => !props.items.length ? h(NEmpty, { size: 'small', description: '暂无数据' }) : h('div', { class: 'bar-list' }, props.items.map(item => h('div', { class: 'bar-item', key: item.name }, [h('span', { title: item.name }, item.name), h('div', { class: 'bar-track' }, [h('div', { class: 'bar-fill', style: { width: width(item.tokens, props.items) } })]), h('b', number(item.tokens))]))) }
})

const columns = [
  { type: 'expand', renderExpand: row => h('dl', { class: 'request-detail' }, details(row).filter(Boolean)) },
  { title: '时间', key: 'timestamp', width: 168, render: row => dateTime(row.timestamp) },
  { title: '工具', key: 'toolType', width: 96, render: row => label(row.toolType) },
  { title: '渠道', key: 'channel', width: 140, ellipsis: { tooltip: true } },
  { title: '模型', key: 'model', width: 190, ellipsis: { tooltip: true } },
  { title: '输入', width: 88, render: row => number(row.tokens?.input) }, { title: '输出', width: 88, render: row => number(row.tokens?.output) },
  { title: '总计', width: 88, render: row => number(row.tokens?.total) }, { title: '耗时', width: 88, render: row => duration(row.duration) },
  { title: '状态', width: 82, render: row => h(NTag, { size: 'small', type: row.success ? 'success' : 'error' }, { default: () => row.success ? '成功' : '失败' }) },
  { title: '成本', width: 96, render: row => cost(row.cost) }
]

function details(row) { return [['调用 ID', row.id], ['渠道 ID', row.channelId], ['完整时间', dateTime(row.timestamp)], ['缓存写入', number(row.tokens?.cacheCreation)], ['缓存命中', number(row.tokens?.cacheRead || row.tokens?.cached)], ['推理 Tokens', number(row.tokens?.reasoning)], ['会话', row.session], ['项目', row.project]].map(([name, value]) => value === undefined || value === null || value === '' ? null : h('div', [h('dt', name), h('dd', String(value))])) }
function fromQuery(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Date(value + 'T00:00:00').getTime() : null }
function dateString(value) { const date = new Date(value); return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0') }
function number(value) { return Number(value || 0).toLocaleString('zh-CN') }
function cost(value) { return '$' + Number(value || 0).toFixed(4) }
function duration(value) { return !value ? '-' : value < 1000 ? value + 'ms' : (value / 1000).toFixed(1) + 's' }
function dateTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false }) }
function label(value) { return value === 'claude-code' ? 'Claude' : value === 'codex' ? 'Codex' : 'Gemini' }
function width(value, items) { return Math.max(5, Math.round((value / Math.max(...items.map(item => item.tokens), 1)) * 100)) + '%' }
function syncQuery() { const [from, to] = dateRange.value; router.replace({ name: 'request-logs', query: { ...(filters.value.toolType ? { toolType: filters.value.toolType } : {}), ...(filters.value.success !== null ? { success: String(filters.value.success) } : {}), ...(filters.value.channel ? { channel: filters.value.channel } : {}), ...(filters.value.model ? { model: filters.value.model } : {}), from: dateString(from), to: dateString(to), ...(filters.value.page > 1 ? { page: String(filters.value.page) } : {}) } }) }
async function loadLogs() { if (!dateRange.value?.[0] || !dateRange.value?.[1]) return message.warning('请选择日期范围'); loading.value = true; try { const result = await getRequestLogs({ from: dateString(dateRange.value[0]), to: dateString(dateRange.value[1]), toolType: filters.value.toolType || undefined, success: filters.value.success === null ? undefined : filters.value.success, channel: filters.value.channel || undefined, model: filters.value.model || undefined, page: filters.value.page, pageSize: 50 }); logs.value = result.items || []; summary.value = result.summary || summary.value; pagination.value = result.pagination || pagination.value; filterOptions.value = result.filterOptions || filterOptions.value; syncQuery() } catch (error) { message.error(error.response?.data?.error || '加载请求日志失败') } finally { loading.value = false } }
function applyFilters() { filters.value.page = 1; loadLogs() }
function goBack() { window.history.length > 1 ? router.back() : router.push({ name: 'home' }) }
function restartAutoRefresh() { if (refreshTimer) clearInterval(refreshTimer); refreshTimer = autoRefresh.value ? setInterval(loadLogs, refreshSeconds.value * 1000) : null }
watch([autoRefresh, refreshSeconds], restartAutoRefresh)
onMounted(() => { loadLogs(); restartAutoRefresh() })
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>

<style scoped>
.request-logs-page { min-height: calc(100vh - 76px); padding: 28px; box-sizing: border-box; background: var(--bg-secondary); }.page-header { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 20px; }.page-header h2 { margin: 8px 0; color: var(--text-primary); }.page-header p { margin: 0; color: var(--text-secondary); }.refresh-controls,.filters { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }.refresh-select { width:110px; }.surface { background: var(--gradient-card); box-shadow: var(--shadow-sm); }.filters > :not(button) { min-width:150px; flex:1 1 150px; }.filters .date-picker { min-width:260px; flex-basis:260px; }.summary-grid,.breakdowns { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin:18px 0; }.breakdowns { grid-template-columns:repeat(2,minmax(0,1fr)); }.summary-card span { color:var(--text-secondary); font-size:13px; }.summary-card strong { display:block; margin-top:6px; font-size:22px; color:var(--text-primary); }.bar-list { display:grid; gap:10px; }.bar-item { display:grid; grid-template-columns:minmax(80px,1fr) 2fr 74px; gap:10px; align-items:center; font-size:12px; }.bar-item span { overflow:hidden; color:var(--text-secondary); text-overflow:ellipsis; white-space:nowrap; }.bar-item b { text-align:right; }.bar-track { height:7px; overflow:hidden; border-radius:999px; background:var(--bg-tertiary); }.bar-fill { height:100%; border-radius:inherit; background:linear-gradient(90deg,#18a058,#36ad6a); }.pagination-row { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-top:18px; color:var(--text-secondary); font-size:13px; }:deep(.request-detail) { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px 22px; margin:0; padding:12px 18px; background:var(--bg-secondary); }:deep(.request-detail dt) { color:var(--text-tertiary); font-size:12px; }:deep(.request-detail dd) { overflow:hidden; margin:3px 0 0; font:12px ui-monospace,SFMono-Regular,Menlo,monospace; text-overflow:ellipsis; white-space:nowrap; }@media(max-width:900px){.request-logs-page{padding:18px}.page-header{flex-direction:column}.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.summary-grid,.breakdowns{grid-template-columns:1fr}.pagination-row{align-items:flex-start;flex-direction:column}:deep(.request-detail){grid-template-columns:1fr}}
</style>
