import type { EnrichedModel } from './modelFetcher'

/** Capability keywords understood by the picker search: `vision`, `reasoning`, `tools`, `free`. */
const CAPS: Record<string, (m: EnrichedModel) => boolean> = {
  vision: (m) => !!m.vision, image: (m) => !!m.vision, multimodal: (m) => !!m.vision,
  reasoning: (m) => !!m.reasoning, thinking: (m) => !!m.reasoning,
  tools: (m) => !!m.tool_call, tool: (m) => !!m.tool_call, functions: (m) => !!m.tool_call,
  free: (m) => (m.cost?.input === 0 && (m.cost.output ?? 0) === 0) || /:free$/.test(m.id),
}

/** True when `needle` appears in order (not necessarily contiguous) inside `hay` — cheap fuzzy match. */
export function subsequence(needle: string, hay: string): boolean {
  let i = 0
  for (let j = 0; j < hay.length && i < needle.length; j++) if (hay[j] === needle[i]) i++
  return i === needle.length
}

/**
 * Every whitespace-separated term must match: a capability keyword, a substring of "name id provider", or (≥3 chars) a
 * subsequence of the model name. `gpt5 vision` therefore finds "GPT-5" with vision support.
 */
export function matchesQuery(m: EnrichedModel, providerName: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = `${m.name} ${m.id} ${providerName}`.toLowerCase()
  const nameKey = `${m.name} ${m.id}`.toLowerCase().replace(/[^a-z0-9]/g, '')
  return terms.every((t) => {
    const cap = CAPS[t]
    if (cap) return cap(m)
    if (hay.includes(t)) return true
    const flat = t.replace(/[^a-z0-9]/g, '')
    return flat.length >= 3 && (nameKey.includes(flat) || subsequence(flat, nameKey))
  })
}

/** Lower is better: exact/prefix/substring hits outrank loose subsequence matches. */
export function scoreModel(m: EnrichedModel, query: string): number {
  const q = query.toLowerCase().trim()
  if (!q) return 0
  const n = m.name.toLowerCase(), id = m.id.toLowerCase()
  if (n === q || id === q) return 0
  if (n.startsWith(q) || id.startsWith(q)) return 1
  if (n.includes(q) || id.includes(q)) return 2
  return 3
}
