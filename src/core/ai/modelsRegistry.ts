import { openDB, type IDBPDatabase } from 'idb'
import { isRegistry, normalizeModelsDev, type Registry } from './modelsDev'
import { enrichRegistry, fetchEnrichment } from './catalogEnricher'

export type RegistrySource = 'edge' | 'directory' | 'bundled' | 'cache'
export interface CachedRegistry { fetchedAt: number; source: RegistrySource; data: Registry }
export interface LoadedRegistry extends CachedRegistry { stale?: boolean }

export const REGISTRY_DB = 'unqstudio-registry'
export const REGISTRY_TTL_MS = 24 * 60 * 60 * 1000
const STORE = 'kv'
const KEY = 'registry'

let dbp: Promise<IDBPDatabase> | null = null
const db = () => (dbp ??= openDB(REGISTRY_DB, 1, { upgrade: (d) => { d.createObjectStore(STORE) } }))

/** Test hook: drop the memoized connection (used when swapping fake-indexeddb factories). */
export const _resetRegistryDb = () => { dbp = null }

export async function readCache(): Promise<CachedRegistry | null> {
  try { const v = await (await db()).get(STORE, KEY); return v && isRegistry(v.data) ? (v as CachedRegistry) : null } catch { return null }
}
export async function writeCache(c: CachedRegistry): Promise<void> {
  try { await (await db()).put(STORE, c, KEY) } catch { /* private mode etc. — cache is best-effort */ }
}
export const isFresh = (c: CachedRegistry, now = Date.now(), ttl = REGISTRY_TTL_MS) => now - c.fetchedAt < ttl

/**
 * Overlay merge: providers/models in `overlay` win by id; providers and models only present in `base` are kept so a
 * partial/failed live response can never make providers or models vanish.
 */
export function mergeRegistries(base: Registry, overlay: Registry): Registry {
  const map = new Map(base.providers.map((p) => [p.id, p]))
  for (const p of overlay.providers) {
    const old = map.get(p.id)
    map.set(p.id, old ? { ...p, models: [...p.models, ...old.models.filter((m) => !p.models.some((x) => x.id === m.id))] } : p)
  }
  return { ...overlay, providers: [...map.values()].sort((a, b) => a.name.localeCompare(b.name)) }
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  const ct = res.headers.get('content-type') ?? ''
  if (ct && !ct.includes('json') && !ct.includes('octet-stream')) throw new Error(`${url} → not JSON (${ct})`)
  return res.json()
}

export const DIRECTORY_URL = 'https://models.dev/api.json' // upstream Provider Directory (internal; never shown in the UI)

/**
 * Unified 4-source catalog. P2 Provider Directory chain: edge `api/catalog` → legacy `api/models-dev` alias → direct upstream
 * (normalized client-side) → bundled snapshot. P3 OpenRouter + P4 LiteLLM then enrich the result in parallel; each fails
 * independently and is skipped, so any single outage still yields a complete catalog. (P1 live /models is per-key: modelFetcher.ts.)
 */
export async function fetchRegistry(fetchImpl: typeof fetch = fetch, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<{ data: Registry; source: RegistrySource }> {
  let dir: { data: Registry; source: RegistrySource } | null = null
  for (const path of ['api/catalog', 'api/models-dev']) {
    try { const j = await getJson(path, fetchImpl); if (isRegistry(j) && j.providers.length > 10) { dir = { data: j, source: 'edge' }; break } } catch { /* next tier */ }
  }
  if (!dir) {
    try { const j = await getJson(DIRECTORY_URL, fetchImpl); const r = normalizeModelsDev(j, { source: 'Provider Directory (live)' }); if (r.providers.length > 10) dir = { data: r, source: 'directory' } } catch { /* next tier */ }
  }
  if (!dir) {
    const j = await getJson('catalog-snapshot.json', fetchImpl)
    if (!isRegistry(j)) throw new Error('bundled catalog-snapshot.json is invalid')
    dir = { data: j, source: 'bundled' }
  }
  const have = dir.data.enriched
  if (have?.openrouter && have.litellm) return dir // edge already merged all sources
  try {
    const extra = await fetchEnrichment(fetchImpl, { signal: opts.signal, timeoutMs: opts.timeoutMs, skip: have })
    if (extra.openrouter || extra.litellm) return { ...dir, data: enrichRegistry(dir.data, extra) }
  } catch { /* enrichment is best-effort */ }
  return dir
}

/** Cached load (24h TTL). `force` bypasses the TTL ("Refresh Registry"). A stale cache is returned if every network tier fails. */
export async function loadRegistry(opts: { force?: boolean; fetchImpl?: typeof fetch; now?: number } = {}): Promise<LoadedRegistry> {
  const now = opts.now ?? Date.now()
  const cached = await readCache()
  if (cached && !opts.force && isFresh(cached, now)) return { ...cached, source: 'cache' }
  try {
    const { data, source } = await fetchRegistry(opts.fetchImpl)
    const merged = cached && source === 'bundled' ? mergeRegistries(data, cached.data) : data
    const entry: CachedRegistry = { fetchedAt: now, source, data: merged }
    await writeCache(entry)
    return entry
  } catch (e) {
    if (cached) return { ...cached, stale: true }
    throw e
  }
}
