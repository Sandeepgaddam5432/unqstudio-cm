// Pure (import-free at runtime) catalog enrichment + dedup pipeline for the 4-source unified Model Catalog.
//   P1 live per-provider /models  → modelFetcher.ts (per key, at request time)
//   P2 Provider Directory         → modelsDev.ts normalizer (300+ providers, endpoints, docs)
//   P3 OpenRouter public API      → normalizeOpenRouter()  (adds same-day launches, fills context/pricing/capabilities)
//   P4 LiteLLM open model specs   → normalizeLiteLLM()     (fills missing pricing + context limits)
// Shared by scripts/sync-catalog.mjs (build snapshot), functions/api/catalog.ts (edge) and the browser client.
// MUST stay dependency-free so the Node script can transpile + import it with esbuild.
import type { RegModel, Registry } from './modelsDev'

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models'
export const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

/** A model record from a secondary (enrichment) source. Prices are USD per 1M tokens. */
export interface ExtraModel {
  id: string
  name?: string
  context?: number
  output?: number
  cost?: { input?: number; output?: number }
  reasoning?: boolean
  vision?: boolean
  tool_call?: boolean
  release_date?: string
  /** LiteLLM `litellm_provider` (used to prefer same-provider matches). */
  provider?: string
}

export interface EnrichmentSources { openrouter?: ExtraModel[]; litellm?: ExtraModel[] }
export interface EnrichmentReport { openrouter: boolean; litellm: boolean }

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {})
const num = (x: unknown): number | undefined => {
  const n = typeof x === 'string' ? Number(x) : (x as number)
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined
}
/** USD/token → USD per 1M tokens (rounded to kill float noise). */
const perM = (x: unknown): number | undefined => { const n = num(x); return n === undefined ? undefined : Math.round(n * 1e6 * 1e4) / 1e4 }

/** Normalise an id for fuzzy matching: lower-case, drop vendor prefix + `:free|:latest` suffix, unify `.`/`_`/`-`. */
export function matchKey(id: string): string {
  return (id.split('/').pop() ?? id).toLowerCase().replace(/:(free|latest|beta|thinking|extended|online|nitro|floor)$/, '').replace(/[._]/g, '-').replace(/-+/g, '-')
}

/** OpenRouter `/api/v1/models` → ExtraModel[]. Prices are strings of USD per token; negative (-1) means dynamic. */
export function normalizeOpenRouter(raw: unknown): ExtraModel[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(rec(raw).data) ? (rec(raw).data as unknown[]) : []
  const out: ExtraModel[] = []
  for (const item of list) {
    const m = rec(item)
    const id = m.id
    if (typeof id !== 'string' || !id) continue
    const arch = rec(m.architecture)
    const inputs = Array.isArray(arch.input_modalities) ? (arch.input_modalities as unknown[]) : []
    const outputs = Array.isArray(arch.output_modalities) ? (arch.output_modalities as unknown[]) : []
    if (outputs.length && !outputs.includes('text')) continue // image/audio-only generators are not chat models
    const params = Array.isArray(m.supported_parameters) ? (m.supported_parameters as unknown[]) : []
    const price = rec(m.pricing)
    const top = rec(m.top_provider)
    const e: ExtraModel = { id, name: typeof m.name === 'string' ? m.name : undefined }
    const ctx = num(m.context_length) ?? num(top.context_length)
    if (ctx) e.context = ctx
    const outTok = num(top.max_completion_tokens)
    if (outTok) e.output = outTok
    const pin = perM(price.prompt), pout = perM(price.completion)
    if (pin !== undefined || pout !== undefined || price.prompt === '0') e.cost = { input: pin ?? 0, output: pout ?? 0 }
    if (params.includes('reasoning') || params.includes('include_reasoning')) e.reasoning = true
    if (inputs.includes('image')) e.vision = true
    if (params.includes('tools')) e.tool_call = true
    const created = num(m.created)
    if (created) e.release_date = new Date(created * 1000).toISOString().slice(0, 10)
    out.push(e)
  }
  return out
}

const LITELLM_CHAT_MODES = new Set(['chat', 'responses', 'completion', undefined])

/** LiteLLM `model_prices_and_context_window.json` (flat map keyed by model id) → ExtraModel[] (chat-capable only). */
export function normalizeLiteLLM(raw: unknown): ExtraModel[] {
  const out: ExtraModel[] = []
  for (const [key, v] of Object.entries(rec(raw))) {
    if (key === 'sample_spec') continue
    const m = rec(v)
    if (!LITELLM_CHAT_MODES.has(m.mode as string | undefined)) continue
    if (typeof m.litellm_provider !== 'string') continue
    const e: ExtraModel = { id: key, provider: m.litellm_provider }
    const ctx = num(m.max_input_tokens) ?? num(m.max_tokens)
    if (ctx) e.context = ctx
    const o = num(m.max_output_tokens)
    if (o) e.output = o
    const pin = perM(m.input_cost_per_token), pout = perM(m.output_cost_per_token)
    if (pin !== undefined || pout !== undefined) e.cost = { input: pin, output: pout }
    if (m.supports_reasoning === true) e.reasoning = true
    if (m.supports_vision === true) e.vision = true
    if (m.supports_function_calling === true) e.tool_call = true
    out.push(e)
  }
  return out
}

/** Fill ONLY missing fields (`target` ← `src`); returns true when anything changed. Higher-priority data is never overwritten. */
function fill(target: RegModel, src: ExtraModel): boolean {
  let changed = false
  if (target.context === undefined && src.context) { target.context = src.context; changed = true }
  if (target.output === undefined && src.output) { target.output = src.output; changed = true }
  if (src.cost && (src.cost.input !== undefined || src.cost.output !== undefined)) {
    if (!target.cost) { target.cost = { ...src.cost }; changed = true }
    else {
      if (target.cost.input === undefined && src.cost.input !== undefined) { target.cost.input = src.cost.input; changed = true }
      if (target.cost.output === undefined && src.cost.output !== undefined) { target.cost.output = src.cost.output; changed = true }
    }
  }
  if (!target.reasoning && src.reasoning) { target.reasoning = true; changed = true }
  if (!target.vision && src.vision) { target.vision = true; changed = true }
  if (!target.tool_call && src.tool_call) { target.tool_call = true; changed = true }
  if (!target.release_date && src.release_date) { target.release_date = src.release_date; changed = true }
  return changed
}

/** Index secondary models by fuzzy key; each key keeps all candidates so a same-provider match can be preferred. */
function indexExtras(list: ExtraModel[]): Map<string, ExtraModel[]> {
  const idx = new Map<string, ExtraModel[]>()
  for (const e of list) {
    const k = matchKey(e.id)
    const a = idx.get(k)
    if (a) a.push(e); else idx.set(k, [e])
  }
  return idx
}

const pick = (cands: ExtraModel[] | undefined, providerId: string): ExtraModel | undefined => {
  if (!cands?.length) return undefined
  const pid = providerId.toLowerCase()
  return cands.find((c) => c.provider && (c.provider === pid || c.provider.startsWith(pid))) ?? cands[0]
}

/** Drop case-insensitive duplicate model ids inside one provider (first = highest priority wins). */
export function dedupeModels(models: RegModel[]): RegModel[] {
  const seen = new Set<string>()
  return models.filter((m) => { const k = m.id.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
}

/**
 * Merge P3 (OpenRouter) and P4 (LiteLLM) into a P2 Provider-Directory registry. Pure; returns a new Registry.
 *  - OpenRouter models missing from the `openrouter` provider are ADDED (same-day launches).
 *  - OpenRouter then LiteLLM fill missing context / output / pricing / capability flags on every provider's models.
 *  - A source that is absent (failed / timed out) is simply skipped, so the result is always at least the directory.
 */
export function enrichRegistry(reg: Registry, src: EnrichmentSources, now: Date = new Date()): Registry {
  const orIdx = indexExtras(src.openrouter ?? [])
  const llIdx = indexExtras(src.litellm ?? [])
  const providers = reg.providers.map((p) => ({ ...p, models: p.models.map((m): RegModel => (m.cost ? { ...m, cost: { ...m.cost } } : { ...m })) }))
  // P3: add brand-new OpenRouter models to the openrouter provider.
  if (src.openrouter?.length) {
    const orp = providers.find((p) => p.id === 'openrouter')
    if (orp) {
      const have = new Set(orp.models.map((m) => m.id.toLowerCase()))
      for (const e of src.openrouter) {
        if (have.has(e.id.toLowerCase())) continue
        const nm: RegModel = { id: e.id, name: e.name || e.id }
        fill(nm, e)
        orp.models.push(nm)
        have.add(e.id.toLowerCase())
      }
      orp.models.sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? '') || a.name.localeCompare(b.name))
    }
  }
  for (const p of providers) {
    for (const m of p.models) {
      const k = matchKey(m.id)
      const exact = p.id === 'openrouter' ? src.openrouter?.find((e) => e.id === m.id) : undefined
      const o = exact ?? pick(orIdx.get(k), p.id)
      if (o) fill(m, o)
      const l = pick(llIdx.get(k), p.id)
      if (l) fill(m, l)
      if (!m.cost || (m.cost.input === undefined && m.cost.output === undefined)) delete m.cost
    }
    p.models = dedupeModels(p.models)
  }
  const prev = reg.enriched
  const report: EnrichmentReport = { openrouter: !!src.openrouter?.length || !!prev?.openrouter, litellm: !!src.litellm?.length || !!prev?.litellm }
  return { ...reg, providers, generatedAt: now.toISOString(), enriched: report }
}

async function getJson(url: string, f: typeof fetch, timeoutMs: number, parent?: AbortSignal): Promise<unknown> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  const onAbort = () => ctl.abort()
  parent?.addEventListener('abort', onAbort)
  try {
    const res = await f(url, { headers: { Accept: 'application/json' }, signal: ctl.signal })
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
    return await res.json()
  } finally { clearTimeout(t); parent?.removeEventListener('abort', onAbort) }
}

/** Fetch P3 + P4 in parallel; each source fails INDEPENDENTLY (timeout / CORS / HTTP / shape) and is then omitted. */
export async function fetchEnrichment(f: typeof fetch = fetch, opts: { timeoutMs?: number; signal?: AbortSignal; skip?: Partial<EnrichmentReport> } = {}): Promise<EnrichmentSources> {
  const timeoutMs = opts.timeoutMs ?? 8000
  const [or, ll] = await Promise.allSettled([
    opts.skip?.openrouter ? Promise.resolve(undefined) : getJson(OPENROUTER_URL, f, timeoutMs, opts.signal).then(normalizeOpenRouter),
    opts.skip?.litellm ? Promise.resolve(undefined) : getJson(LITELLM_URL, f, Math.max(timeoutMs, 15000), opts.signal).then(normalizeLiteLLM),
  ])
  const out: EnrichmentSources = {}
  if (or.status === 'fulfilled' && or.value?.length) out.openrouter = or.value
  if (ll.status === 'fulfilled' && ll.value?.length) out.litellm = ll.value
  return out
}
