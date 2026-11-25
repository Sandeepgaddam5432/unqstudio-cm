import { openDB, type IDBPDatabase } from 'idb'
import type { Fetcher } from './types'

const mem = new Map<string, string>()
let dbp: Promise<IDBPDatabase> | null = null
const DAY = 24 * 3600 * 1000

function db() {
  if (typeof indexedDB === 'undefined') return null
  return (dbp ??= openDB('unqstudio-cdn', 1, { upgrade(d) { d.createObjectStore('modules') } }))
}

/** Unversioned URLs (resolving to “latest”) expire after a day; pinned ones are cached forever. */
const isPinned = (url: string) => /@\^?~?\d/.test(url)

export function createCachedFetcher(onFetch?: (url: string, source: 'memory' | 'idb' | 'network') => void): Fetcher {
  return async (url) => {
    const m = mem.get(url)
    if (m !== undefined) { onFetch?.(url, 'memory'); return m }
    const d = db()
    if (d) {
      try {
        const rec = (await (await d).get('modules', url)) as { text: string; ts: number } | undefined
        if (rec && (isPinned(url) || Date.now() - rec.ts < DAY)) {
          mem.set(url, rec.text)
          onFetch?.(url, 'idb')
          return rec.text
        }
      } catch { /* cache is best-effort */ }
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status}${res.status === 404 ? ' – package or version not found on esm.sh' : ''})`)
    const text = await res.text()
    mem.set(url, text)
    onFetch?.(url, 'network')
    if (d) void (await d).put('modules', { text, ts: Date.now() }, url).catch(() => {})
    return text
  }
}

export async function clearCdnCache() {
  mem.clear()
  const d = db()
  if (d) await (await d).clear('modules')
}
export async function cdnCacheSize(): Promise<number> {
  const d = db()
  return d ? (await d).count('modules') : mem.size
}
