const TAG_COLORS = [
  { color: '#18a058', textColor: '#fff' },
  { color: '#2080f0', textColor: '#fff' },
  { color: '#f0a020', textColor: '#fff' },
  { color: '#d03050', textColor: '#fff' },
  { color: '#7c3aed', textColor: '#fff' },
  { color: '#0891b2', textColor: '#fff' },
  { color: '#ea580c', textColor: '#fff' },
  { color: '#be185d', textColor: '#fff' }
]

export function hashCode(text = '') {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i)
    hash |= 0
  }
  return hash
}

export function getTagColor(tag = '') {
  const hash = hashCode(String(tag))
  const index = Math.abs(hash) % TAG_COLORS.length
  return TAG_COLORS[index]
}
