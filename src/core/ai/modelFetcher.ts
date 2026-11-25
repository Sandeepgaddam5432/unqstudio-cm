import type { RegModel, RegProvider } from './modelsDev'

/** A model as shown in the picker: live id enriched with models.dev metadata. */
export interface EnrichedModel {
  id: string
  name: string
  context?: number
  output?: number
  cost?: { input?: number; output?: number }
  reasoning?: boolean
  vision?: boolean
  tool_call?: boolean
  source: 'live' | 'catalog' | 'custom' | 'builtin'
}

export interface LiveTarget { id: string; kind: 'openai' | 'anthropic'; baseUrl: string }
export interface Endpoint { url: string; headers: Record<string, string>; parse: (json: unknown) => RawLive[] }
export interface RawLive { id: string; name?: string; context?: number; output?: number }

const trim = (s: string) => s.replace(/\/+$/, '')
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {})

export function parseOpenAIModels(json: unknown): RawLive[] {
  const j = rec(json)
  const list = Array.isArray(json) ? json : arr(j.data ?? j.models)
  return list.flatMap((m) => {
    const o = rec(m); const id = typeof m === 'string' ? m : (o.id as string | undefined)
    if (!id) return []
    const ctx = (o.context_length ?? o.context_window) as number | undefined
    return [{ id, name: (o.name as string | undefined) !== id ? (o.name as string | undefined) : undefined, context: typeof ctx === 'number' ? ctx : undefined }]
  })
}

export function parseGeminiModels(json: unknown): RawLive[] {
  return arr(rec(json).models).flatMap((m) => {
    const o = rec(m); const name = o.name as string | undefined
    const methods = arr(o.supportedGenerationMethods)
    if (!name || (methods.length && !methods.includes('generateContent'))) return []
    return [{ id: name.replace(/^models\//, ''), name: o.displayName as string | undefined, context: o.inputTokenLimit as number | undefined, output: o.outputTokenLimit as number | undefined }]
  })
}

export function parseAnthropicModels(json: unknown): RawLive[] {
  return arr(rec(json).data).flatMap((m) => { const o = rec(m); return o.id ? [{ id: o.id as string, name: o.display_name as string | undefined }] : [] })
}

export function parseOllamaModels(json: unknown): RawLive[] {
  return arr(rec(json).models).flatMap((m) => { const o = rec(m); const id = (o.name ?? o.model) as string | undefined; return id ? [{ id }] : [] })
}

/** Decide the live `/models` endpoint for a provider (see DOCS/03). */
export function liveEndpoint(p: LiveTarget, apiKey?: string, baseOverride?: string): Endpoint {
  const base = trim(baseOverride || p.baseUrl)
  if (p.id === 'gemini' || p.id === 'google' || /generativelanguage\.googleapis\.com/.test(base)) {
    return { url: `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey ?? '')}`, headers: {}, parse: parseGeminiModels }
  }
  if (p.kind === 'anthropic') {
    return { url: `${base}/models?limit=1000`, headers: { 'x-api-key': apiKey ?? '', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, parse: parseAnthropicModels }
  }
  if (p.id === 'ollama' || /:11434(\/|$)/.test(base)) {
    return { url: `${base.replace(/\/v1$/, '')}/api/tags`, headers: {}, parse: parseOllamaModels }
  }
  return { url: `${base}/models`, headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, parse: parseOpenAIModels }
}

const norm = (s: string) => s.toLowerCase()
const tail = (s: string) => norm(s.split('/').pop() ?? s).replace(/:(free|latest|beta)$/, '')

/** Match a live id against the catalog: exact → case-insensitive → last path segment. */
export function findCatalogModel(id: string, catalog: RegModel[]): RegModel | undefined {
  return catalog.find((m) => m.id === id) ?? catalog.find((m) => norm(m.id) === norm(id)) ?? catalog.find((m) => tail(m.id) === tail(id))
}

const fromCatalog = (m: RegModel, source: EnrichedModel['source']): EnrichedModel => ({ id: m.id, name: m.name, context: m.context, output: m.output, cost: m.cost, reasoning: m.reasoning, vision: m.vision, tool_call: m.tool_call, source })

/** Enrich live-fetched models with models.dev metadata (pretty name, context, pricing, capability badges). */
export function enrichModels(live: RawLive[], catalog: RegModel[] = []): EnrichedModel[] {
  const seen = new Set<string>()
  const out: EnrichedModel[] = []
  for (const l of live) {
    if (seen.has(l.id)) continue
    seen.add(l.id)
    const c = findCatalogModel(l.id, catalog)
    out.push(c
      ? { ...fromCatalog(c, 'live'), id: l.id, context: c.context ?? l.context, output: c.output ?? l.output }
      : { id: l.id, name: l.name || l.id, context: l.context, output: l.output, source: 'live' })
  }
  return out
}

export const catalogModels = (rp?: RegProvider): EnrichedModel[] => (rp?.models ?? []).map((m) => fromCatalog(m, 'catalog'))

export type FetchOutcome =
  | { ok: true; models: EnrichedModel[]; source: 'live'; ms: number }
  | { ok: false; error: string; code: 'nokey' | 'http' | 'network' | 'parse' | 'empty'; models: EnrichedModel[]; source: 'catalog'; ms: number }

/**
 * Query the provider's LIVE models endpoint and enrich the result. On any failure (no key, CORS, 401, empty list)
 * returns the models.dev catalog as a clean fallback — callers can still add a custom model ID manually.
 */
export async function fetchLiveModels(args: { provider: LiveTarget & { noKey?: boolean }; apiKey?: string; baseUrl?: string; registryProvider?: RegProvider; fetchImpl?: typeof fetch; signal?: AbortSignal }): Promise<FetchOutcome> {
  const { provider, apiKey, baseUrl, registryProvider, signal } = args
  const f = args.fetchImpl ?? fetch
  const t0 = Date.now()
  const catalog = catalogModels(registryProvider)
  const fail = (code: 'nokey' | 'http' | 'network' | 'parse' | 'empty', error: string): FetchOutcome => ({ ok: false, code, error, models: catalog, source: 'catalog', ms: Date.now() - t0 })
  if (!provider.noKey && !apiKey) return fail('nokey', 'Add an API key to fetch the live model list.')
  const ep = liveEndpoint(provider, apiKey, baseUrl)
  let res: Response
  try { res = await f(ep.url, { headers: ep.headers, signal }) } catch (e) {
    return fail('network', e instanceof TypeError ? 'Could not reach the models endpoint (network or CORS). Showing the models.dev catalog instead.' : String(e))
  }
  if (!res.ok) return fail('http', res.status === 401 || res.status === 403 ? `The provider rejected the key (HTTP ${res.status}).` : `Models endpoint returned HTTP ${res.status}. Showing the models.dev catalog instead.`)
  let raw: RawLive[]
  try { raw = ep.parse(await res.json()) } catch { return fail('parse', 'Unexpected response from the models endpoint.') }
  if (!raw.length) return fail('empty', 'The endpoint returned no models.')
  return { ok: true, models: enrichModels(raw, registryProvider?.models ?? []), source: 'live', ms: Date.now() - t0 }
}
