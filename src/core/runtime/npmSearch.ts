/** Terminal-free npm package search/installer core: registry search URL + parser, package.json add/remove, esm.sh warm-up URLs. */
export interface NpmPackage { name: string; version: string; description: string; author?: string; date?: string; homepage?: string }
export const buildSearchUrl = (q: string, size = 10) => `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q.trim())}&size=${Math.min(25, Math.max(1, size))}`
export function parseSearchResponse(json: unknown): NpmPackage[] {
  const objs = (json as { objects?: unknown[] } | null)?.objects
  if (!Array.isArray(objs)) return []
  const out: NpmPackage[] = []
  for (const o of objs) {
    const p = (o as { package?: Record<string, any> }).package  
    if (!p || typeof p.name !== 'string' || typeof p.version !== 'string') continue
    out.push({ name: p.name, version: p.version, description: String(p.description ?? ''), author: p.publisher?.username ?? p.author?.name, date: p.date, homepage: p.links?.homepage ?? p.links?.npm })
  }
  return out
}
export async function searchNpm(q: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<NpmPackage[]> {
  if (q.trim().length < 2) return []
  const res = await fetchImpl(buildSearchUrl(q), { signal })
  if (!res.ok) throw new Error(`npm registry returned HTTP ${res.status}`)
  return parseSearchResponse(await res.json())
}
const VALID = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/
export function addDependency(pkgJson: string, name: string, version: string, dev = false): string {
  if (!VALID.test(name)) throw new Error(`Invalid package name: ${name}`)
  const j = JSON.parse(pkgJson || '{}') as Record<string, Record<string, string>>
  const key = dev ? 'devDependencies' : 'dependencies'
  j[key] = { ...(j[key] ?? {}), [name]: /^[\^~]|^\d/.test(version) ? (/^\d/.test(version) ? `^${version}` : version) : 'latest' }
  j[key] = Object.fromEntries(Object.entries(j[key]).sort(([a], [b]) => a.localeCompare(b)))
  return JSON.stringify(j, null, 2) + '\n'
}
export function removeDependency(pkgJson: string, name: string): string {
  const j = JSON.parse(pkgJson || '{}') as Record<string, Record<string, string>>
  for (const k of ['dependencies', 'devDependencies']) if (j[k]) delete j[k][name]
  return JSON.stringify(j, null, 2) + '\n'
}
export const esmWarmUrl = (name: string, version: string) => `https://esm.sh/${name}@${version.replace(/^[\^~]/, '')}`
