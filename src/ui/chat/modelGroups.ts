import type { EnrichedModel } from '@/core/ai/modelFetcher'

/** Capability / purpose groups shown by the calm "Recommended" picker view (v3.2). */
export type GroupId = 'recommended' | 'reasoning' | 'coding' | 'vision' | 'fast' | 'local'
export const GROUP_LABELS: Record<GroupId, string> = { recommended: 'Recommended', reasoning: 'Reasoning', coding: 'Coding', vision: 'Vision', fast: 'Fast / Free', local: 'Custom & Local' }
export const GROUP_ORDER: GroupId[] = ['recommended', 'reasoning', 'coding', 'vision', 'fast', 'local']
export const GROUP_CAP = 6

const FLAGSHIP = /(claude-(opus|sonnet)|gpt-5|gpt-4\.1|gpt-4o(?!-mini)|gemini-(2\.5|3)-pro|gemini-3|deepseek-(v3|chat)|qwen3-max|kimi-k2|grok-4|llama-3\.3|mistral-large)/i
const CODING = /(code|coder|codex|devstral|sonnet|codestral|swe)/i
const REASONING = /(\bo1\b|\bo3\b|\bo4\b|-r1|reason|thinking|opus|gpt-5(?!.*(chat|mini|nano))|pro\b)/i
const FAST = /(flash|mini|haiku|nano|lite|instant|fast|turbo|small|:free|-free|free\b|8b|7b)/i

export const isFree = (m: EnrichedModel): boolean => m.cost?.input === 0 || /(:free|-free|\(free\))/i.test(m.id + m.name)
export const isReasoning = (m: EnrichedModel): boolean => !!m.reasoning || REASONING.test(m.id)
export const isCoding = (m: EnrichedModel): boolean => CODING.test(m.id)
export const isFast = (m: EnrichedModel): boolean => isFree(m) || FAST.test(m.id)

/** The ONE subtle capability pill shown per model row (or null). */
export function primaryTag(m: EnrichedModel): string | null {
  if (isFree(m)) return 'Free'
  if (isReasoning(m)) return 'Reasoning'
  if (isCoding(m)) return 'Coding'
  if (m.vision) return 'Vision'
  if (isFast(m)) return 'Fast'
  return null
}

export interface Entry<P> { p: P; m: EnrichedModel }

/** Assign every model to at most one group (first match wins), capped per group, preserving input order. */
export function groupModels<P extends { custom?: unknown; compat?: string; id: string }>(entries: Entry<P>[], favoriteKeys: string[] = [], keyOf: (e: Entry<P>) => string = (e) => `${e.p.id}::${e.m.id}`): Record<GroupId, Entry<P>[]> {
  const out: Record<GroupId, Entry<P>[]> = { recommended: [], reasoning: [], coding: [], vision: [], fast: [], local: [] }
  const seen = new Set<string>()
  const put = (g: GroupId, e: Entry<P>) => { const k = keyOf(e); if (seen.has(k) || out[g].length >= GROUP_CAP) return false; seen.add(k); out[g].push(e); return true }
  const favs = entries.filter((e) => favoriteKeys.includes(keyOf(e)))
  for (const e of favs) put('recommended', e)
  for (const e of entries) if (FLAGSHIP.test(e.m.id) && !isFast(e.m)) put('recommended', e)
  for (const e of entries) if (e.p.custom || e.p.compat === 'local') put('local', e)
  for (const e of entries) if (isCoding(e.m)) put('coding', e)
  for (const e of entries) if (isReasoning(e.m)) put('reasoning', e)
  for (const e of entries) if (e.m.vision) put('vision', e)
  for (const e of entries) if (isFast(e.m)) put('fast', e)
  return out
}
