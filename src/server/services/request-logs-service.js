const fs = require('fs');
const path = require('path');
const { getStatsPath } = require('../../utils/app-path-manager');

const MAX_RANGE_DAYS = 90;

function getRequestLogFilePath(date) {
  const [year, month, day] = date.split('-');
  return path.join(getStatsPath(), 'request-logs', `${year}-${month}`, `${day}.jsonl`);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateRange(from, to) {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end || start > end) {
    throw new Error('日期范围无效');
  }

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
    if (dates.length > MAX_RANGE_DAYS) {
      throw new Error(`日期范围不能超过 ${MAX_RANGE_DAYS} 天`);
    }
  }
  return dates;
}

function appendRequestLog(logEntry) {
  const timestamp = new Date(logEntry.timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    console.error('[Request Logs] 无法写入无效时间戳的请求日志');
    return;
  }

  const filePath = getRequestLogFilePath(formatLocalDate(timestamp));
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(logEntry)}\n`, 'utf8');
  } catch (error) {
    console.error('[Request Logs] 写入请求日志失败:', error);
  }
}

function readLogsForDates(dates) {
  const logs = [];
  dates.forEach((date) => {
    const filePath = getRequestLogFilePath(date);
    if (!fs.existsSync(filePath)) return;

    try {
      const lines = fs.readFileSync(filePath, 'utf8').split('\n');
      lines.forEach((line) => {
        if (!line.trim()) return;
        try {
          const entry = JSON.parse(line);
          if (entry && entry.timestamp) logs.push(entry);
        } catch (error) {
          console.warn(`[Request Logs] 忽略损坏日志行: ${filePath}`);
        }
      });
    } catch (error) {
      console.error(`[Request Logs] 读取日志失败: ${filePath}`, error);
    }
  });
  return logs;
}

function matchesFilters(entry, filters) {
  if (filters.toolType && entry.toolType !== filters.toolType) return false;
  if (filters.channel && entry.channel !== filters.channel) return false;
  if (filters.model && entry.model !== filters.model) return false;
  if (filters.success !== undefined && Boolean(entry.success) !== filters.success) return false;
  return true;
}

function createBreakdown(entries, field) {
  const totals = new Map();
  entries.forEach((entry) => {
    const key = entry[field] || '未标记';
    const current = totals.get(key) || { name: key, requests: 0, tokens: 0, cost: 0 };
    current.requests += 1;
    current.tokens += Number(entry.tokens?.total) || 0;
    current.cost += Number(entry.cost) || 0;
    totals.set(key, current);
  });
  return Array.from(totals.values())
    .sort((left, right) => right.tokens - left.tokens || right.requests - left.requests)
    .slice(0, 5);
}

function getRequestLogs(filters) {
  const dates = getDateRange(filters.from, filters.to);
  const rangeEntries = readLogsForDates(dates);
  const entries = rangeEntries
    .filter((entry) => matchesFilters(entry, filters))
    .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(filters.pageSize, 10) || 50));
  const total = entries.length;
  const totalTokens = entries.reduce((sum, entry) => sum + (Number(entry.tokens?.total) || 0), 0);
  const totalCost = entries.reduce((sum, entry) => sum + (Number(entry.cost) || 0), 0);
  const successful = entries.filter(entry => entry.success === true).length;

  return {
    items: entries.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    summary: {
      requests: total,
      tokens: totalTokens,
      cost: totalCost,
      successful,
      failed: total - successful,
      topChannels: createBreakdown(entries, 'channel'),
      topModels: createBreakdown(entries, 'model')
    },
    filterOptions: {
      channels: [...new Set(rangeEntries.map(entry => entry.channel).filter(Boolean))].sort(),
      models: [...new Set(rangeEntries.map(entry => entry.model).filter(Boolean))].sort()
    }
  };
}

module.exports = {
  appendRequestLog,
  getRequestLogs
};
