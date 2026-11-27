import type { RegModel, RegProvider } from './modelsDev'
import type { ProviderKind } from './providers'
import { hasVersionSegment, normalizeBaseUrl } from '@/services/llm/urls'
import { pickFetch } from '@/services/llm/proxy'

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

export interface LiveTarget { id: string; kind: ProviderKind; baseUrl: string; /** Custom HTTP headers merged into the request. */ headers?: Record<string, string>; /** Anthropic wire: send the direct-browser-access header (default true). */ browserAccess?: boolean; /** v3.3: tunnel through the CORS proxy. */ viaProxy?: boolean }
export interface Endpoint { /** Base URL this probe corresponds to (openai wire). */ base?: string; url: string; headers: Record<string, string>; parse: (json: unknown) => RawLive[] }
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

/** Decide the live models endpoint for a provider's wire protocol (see DOCS/03). Custom headers are merged last (they win). */
export function liveEndpoint(p: LiveTarget, apiKey?: string, baseOverride?: string): Endpoint {
  const base = normalizeBaseUrl(baseOverride || p.baseUrl)
  const extra = p.headers ?? {}
  const gemRoot = () => trim(base || 'https://generativelanguage.googleapis.com').replace(/\/v1(beta)?(\/openai)?$/, '')
  if (p.kind === 'gemini' || p.id === 'gemini' || p.id === 'google' || /generativelanguage\.googleapis\.com/.test(base)) {
    const root = p.kind === 'gemini' ? gemRoot() : 'https://generativelanguage.googleapis.com'
    return { url: `${root}/v1beta/models?pageSize=1000${apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''}`, headers: { ...extra }, parse: parseGeminiModels }
  }
  if (p.kind === 'anthropic') {
    const root = /\/v\d+$/.test(base) ? base : `${base}/v1`
    return { url: `${root}/models?limit=1000`, headers: { 'x-api-key': apiKey ?? '', 'anthropic-version': '2023-06-01', ...(p.browserAccess === false ? {} : { 'anthropic-dangerous-direct-browser-access': 'true' }), ...extra }, parse: parseAnthropicModels }
  }
  if (p.kind === 'ollama' || p.id === 'ollama' || /:11434(\/|$)/.test(base)) {
    return { url: `${trim(base || 'http://localhost:11434').replace(/\/(v1|api)$/, '')}/api/tags`, headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...extra }, parse: parseOllamaModels }
  }
  return { base, url: `${base}/models`, headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...extra }, parse: parseOpenAIModels }
}

/** Ordered probes for the live model list: the normalised endpoint first, then `{base}/v1/models` for OpenAI-wire bases without a version segment. */
export function liveEndpoints(p: LiveTarget, apiKey?: string, baseOverride?: string): Endpoint[] {
  const first = liveEndpoint(p, apiKey, baseOverride)
  if (p.kind !== 'openai' || !first.base || hasVersionSegment(first.base) || !first.url.endsWith('/models')) return [first]
  return [first, { ...first, base: `${first.base}/v1`, url: `${first.base}/v1/models` }]
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
  | { ok: true; models: EnrichedModel[]; source: 'live'; ms: number; /** Base URL whose /models answered (may add `/v1`). */ resolvedBase?: string }
  | { ok: false; error: string; code: 'nokey' | 'http' | 'network' | 'parse' | 'empty'; models: EnrichedModel[]; source: 'catalog'; ms: number }

/**
 * Query the provider's LIVE models endpoint and enrich the result. On any failure (no key, CORS, 401, empty list)
 * returns the models.dev catalog as a clean fallback — callers can still add a custom model ID manually.
 */
export async function fetchLiveModels(args: { provider: LiveTarget & { noKey?: boolean }; apiKey?: string; baseUrl?: string; registryProvider?: RegProvider; fetchImpl?: typeof fetch; signal?: AbortSignal }): Promise<FetchOutcome> {
  const { provider, apiKey, baseUrl, registryProvider, signal } = args
  const f = args.fetchImpl ?? pickFetch(provider.viaProxy)
  const t0 = Date.now()
  const catalog = catalogModels(registryProvider)
  const fail = (code: 'nokey' | 'http' | 'network' | 'parse' | 'empty', error: string): FetchOutcome => ({ ok: false, code, error, models: catalog, source: 'catalog', ms: Date.now() - t0 })
  if (!provider.noKey && !apiKey) return fail('nokey', 'Add an API key to fetch the live model list.')
  const probes = liveEndpoints(provider, apiKey, baseUrl)
  let res: Response | undefined
  let ep = probes[0]!
  let netErr: unknown
  for (const cand of probes) {
    try {
      const r = await f(cand.url, { headers: cand.headers, signal })
      res = r; ep = cand
      if (r.ok || (r.status !== 404 && r.status !== 405)) break // auth / server errors will not improve on another path
    } catch (e) { netErr = e }
  }
  if (!res) return fail('network', netErr instanceof TypeError ? `Could not reach the models endpoint${provider.viaProxy ? ' (even through the UnQStudio proxy)' : ' (network or CORS) — turn on “Route via UnQStudio CORS Proxy”'}. Showing the catalog instead.` : String(netErr))
  if (!res.ok) return fail('http', res.status === 401 || res.status === 403 ? `The provider rejected the key (HTTP ${res.status}).` : `Models endpoint returned HTTP ${res.status}. Showing the catalog instead.`)
  let raw: RawLive[]
  try { raw = ep.parse(await res.json()) } catch { return fail('parse', 'Unexpected response from the models endpoint.') }
  if (!raw.length) return fail('empty', 'The endpoint returned no models.')
  return { ok: true, models: enrichModels(raw, registryProvider?.models ?? []), source: 'live', ms: Date.now() - t0, resolvedBase: ep.base }
}
