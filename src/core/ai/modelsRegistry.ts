import { openDB, type IDBPDatabase } from 'idb'
import { isRegistry, normalizeModelsDev, type Registry } from './modelsDev'

export type RegistrySource = 'edge' | 'models.dev' | 'bundled' | 'cache'
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

/** Tier 2 chain: edge function → direct models.dev (normalized client-side) → bundled snapshot. */
export async function fetchRegistry(fetchImpl: typeof fetch = fetch): Promise<{ data: Registry; source: RegistrySource }> {
  try { const j = await getJson('api/models-dev', fetchImpl); if (isRegistry(j) && j.providers.length > 10) return { data: j, source: 'edge' } } catch { /* next tier */ }
  try { const j = await getJson('https://models.dev/api.json', fetchImpl); const r = normalizeModelsDev(j, { source: 'models.dev (direct)' }); if (r.providers.length > 10) return { data: r, source: 'models.dev' } } catch { /* next tier */ }
  const j = await getJson('models-registry.json', fetchImpl)
  if (!isRegistry(j)) throw new Error('bundled models-registry.json is invalid')
  return { data: j, source: 'bundled' }
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
