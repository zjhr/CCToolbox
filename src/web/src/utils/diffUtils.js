import { applyPatch } from 'diff'

export function applyUnifiedPatch(content, patch) {
  if (!patch) return null
  try {
    const result = applyPatch(content, patch)
    return result === false ? null : result
  } catch (err) {
    return null
  }
}
