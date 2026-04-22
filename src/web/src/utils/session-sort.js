const DEFAULT_TIME_KEYS = ['mtime', 'lastUpdated', 'timestamp']

function toTimeMs(value) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

export function getSessionTimeMs(session, timeKeys = DEFAULT_TIME_KEYS) {
  if (!session || typeof session !== 'object') return 0
  for (const key of timeKeys) {
    const time = toTimeMs(session[key])
    if (time > 0) return time
  }
  return 0
}

export function sortSessionsByMtimeDesc(sessions, timeKeys = DEFAULT_TIME_KEYS) {
  if (!Array.isArray(sessions)) return sessions
  sessions.sort((a, b) => getSessionTimeMs(b, timeKeys) - getSessionTimeMs(a, timeKeys))
  return sessions
}
