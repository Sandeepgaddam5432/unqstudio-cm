/** Subsequence fuzzy matcher. Returns -1 when `query` does not match, otherwise a score (higher = better). */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (!q) return 0
  const t = text.toLowerCase()
  let ti = 0
  let score = 0
  let streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti)
    if (idx === -1) return -1
    const boundary = idx === 0 || /[\s/_.-]/.test(t[idx - 1])
    streak = idx === ti && qi > 0 ? streak + 1 : 0
    score += 1 + streak * 2 + (boundary ? 3 : 0) - Math.min(idx - ti, 5) * 0.2
    ti = idx + 1
  }
  if (t.includes(q)) score += 6
  return score - t.length * 0.01
}
