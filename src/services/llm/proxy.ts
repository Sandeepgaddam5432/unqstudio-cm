import { isLocalUrl } from './urls'

export const PROXY_PATH = '/api/proxy'

/** When the host has no proxy function (static preview / dev server) skip the probe for a while instead of 404-ing on every request. */
let missingUntil = 0
export const resetProxyProbe = () => { missingUntil = 0 }

/**
 * A `fetch` that tunnels through the UnQStudio CORS proxy (`functions/api/proxy.ts`): the real request becomes a JSON envelope
 * `{ url, method, headers, body }` POSTed same-origin, and the (streaming) response is returned untouched, so SSE works.
 * Local / plain-http targets and hosts without the function (static preview, dev server) transparently fall back to a direct request.
 */
export function createProxiedFetch(opts: { proxyPath?: string; baseFetch?: typeof fetch } = {}): typeof fetch {
  const proxyPath = opts.proxyPath ?? PROXY_PATH
  const base = opts.baseFetch
  return async (input, init) => {
    const f = base ?? globalThis.fetch.bind(globalThis)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (isLocalUrl(url) || !/^https:\/\//i.test(url) || Date.now() < missingUntil) return f(input, init)
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v })
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : undefined
    let res: Response
    try {
      res = await f(proxyPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, method, headers, body }), signal: init?.signal })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e
      return f(input, init) // proxy unreachable (offline dev server) → try direct
    }
    // No `x-unq-proxy` header ⇒ the path is not our function (static host / SPA fallback): use a direct request instead.
    if (!res.headers.has('x-unq-proxy')) { missingUntil = Date.now() + 5 * 60_000; return f(input, init) }
    return res
  }
}

/** Fetch to use for a provider: the CORS proxy when `viaProxy`, the plain global fetch otherwise. */
export const pickFetch = (viaProxy?: boolean): typeof fetch => (viaProxy ? createProxiedFetch() : (((i, n) => globalThis.fetch(i, n)) as typeof fetch))
