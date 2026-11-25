export class DeployError extends Error {
  constructor(message: string, public status?: number, public blockedByBrowser = false) {
    super(message)
    this.name = 'DeployError'
  }
}

export interface DeployFile { path: string; content: string; encoding: 'utf8' | 'base64' }
export interface StaticFile { path: string; bytes: Uint8Array }
export type Log = (message: string) => void

const enc = new TextEncoder()
export const utf8ToBytes = (s: string) => enc.encode(s)
export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
export function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export const utf8ToB64 = (s: string) => bytesToB64(utf8ToBytes(s))
export const deployFileBytes = (f: DeployFile) => (f.encoding === 'base64' ? b64ToBytes(f.content) : utf8ToBytes(f.content))

async function digest(algo: 'SHA-1' | 'SHA-256', bytes: Uint8Array) {
  const d = new Uint8Array(await crypto.subtle.digest(algo, bytes as BufferSource))
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export const sha1Hex = (b: Uint8Array) => digest('SHA-1', b)
export const sha256Hex = (b: Uint8Array) => digest('SHA-256', b)

export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }))
  return out
}

/** Fetch wrapper: JSON in/out, readable errors, flags browser-level (CORS/network) failures. */
export async function api<T = any>(f: typeof fetch, service: string, url: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try { res = await f(url, init) } catch (e) {
    throw new DeployError(`Could not reach ${service} from the browser${e instanceof Error ? ` (${e.message})` : ''}. The API may not allow cross-origin requests (CORS).`, undefined, true)
  }
  const text = await res.text()
  let json: any
  try { json = text ? JSON.parse(text) : {} } catch { json = { message: text.slice(0, 200) } }
  if (!res.ok) throw new DeployError(json.message ?? json.error?.message ?? json.errors?.[0]?.message ?? (typeof json.error === 'string' ? json.error : `${service} returned HTTP ${res.status}`), res.status)
  return json as T
}

export const IGNORED_PATH = /(^|\/)(node_modules|\.git|dist|\.next|\.DS_Store|__MACOSX)(\/|$)|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/
