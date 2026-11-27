// Cloudflare Pages Function: streaming CORS proxy for custom AI providers (POST /api/proxy).
// Custom gateways (e.g. https://api.numes.ai/api/v1) often do not send CORS headers, so the browser cannot call them directly.
// The client posts a JSON envelope { url, method, headers, body }; this function validates the target (public https hosts only — SSRF guard),
// forwards it with the caller's upstream auth headers, and streams the response back WITHOUT buffering (SSE `text/event-stream` pass-through).
// Upstream status codes and error bodies are forwarded verbatim so an invalid key/model still reads "401 invalid api key" in the app.
// Standard Web APIs only (Fetch, Streams) — zero Node dependencies.

type PagesFunction = (ctx: { request: Request }) => Response | Promise<Response>

export const MAX_ENVELOPE_BYTES = 12 * 1024 * 1024
/** Ports a Cloudflare Worker may reach over https (and the only ones we proxy). */
export const ALLOWED_PORTS = new Set(['', '443', '2053', '2083', '2087', '2096', '8443'])
const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet', '.localdomain', '.private', '.svc', '.cluster.local']
const STRIP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length', 'cookie', 'set-cookie', 'origin', 'referer', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'keep-alive', 'proxy-authorization', 'proxy-connection', 'expect', 'accept-encoding', 'x-real-ip'])
const STRIP_REQUEST_PREFIXES = ['cf-', 'x-forwarded-', 'sec-', 'x-unq-']
const PASS_RESPONSE_HEADERS = ['content-type', 'retry-after', 'x-request-id', 'request-id', 'openai-processing-ms']

export class ProxyError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'bad_request') { super(message) }
}

function ipv4Parts(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return null
  const p = m.slice(1).map(Number)
  return p.every((n) => n >= 0 && n <= 255) ? p : null
}

/** True for loopback, RFC1918, CGNAT, link-local (cloud metadata 169.254.169.254), TEST-NETs, benchmarking, multicast and reserved IPv4. */
export function isPrivateIPv4(p: number[]): boolean {
  const [a, b, c] = p as [number, number, number, number]
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
}

/**
 * SSRF guard: only `https://` URLs on public DNS hostnames or public IPv4 literals. Rejects credentials, IPv6 literals, private/loopback/link-local
 * ranges (WHATWG URL already canonicalises 2130706433 / 0x7f.1 into 127.0.0.1), single-label & internal TLDs and non-web ports.
 */
export function assertPublicHttpsUrl(raw: unknown, selfHost?: string): URL {
  if (typeof raw !== 'string' || !raw.trim()) throw new ProxyError('Missing target url.', 400, 'missing_url')
  let u: URL
  try { u = new URL(raw.trim()) } catch { throw new ProxyError('The target url is not a valid URL.', 400, 'invalid_url') }
  if (u.protocol !== 'https:') throw new ProxyError('Only https:// targets can be proxied.', 400, 'https_only')
  if (u.username || u.password) throw new ProxyError('Credentials in the url are not allowed.', 400, 'credentials_in_url')
  if (!ALLOWED_PORTS.has(u.port)) throw new ProxyError(`Port ${u.port} is not allowed.`, 403, 'port_blocked')
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (host.startsWith('[') || host.includes(':')) throw new ProxyError('IPv6 literal hosts are not allowed.', 403, 'private_host')
  const v4 = ipv4Parts(host)
  if (v4) { if (isPrivateIPv4(v4)) throw new ProxyError('Private, loopback and link-local addresses are blocked.', 403, 'private_host') }
  else {
    if (!host.includes('.') || host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new ProxyError('Internal hostnames are blocked.', 403, 'private_host')
    if (/^[\d.]+$/.test(host) || /^0x[0-9a-f]+/i.test(host)) throw new ProxyError('Numeric hosts must be plain public IPv4 addresses.', 403, 'private_host')
  }
  if (selfHost && u.host.toLowerCase() === selfHost.toLowerCase()) throw new ProxyError('The proxy cannot target itself.', 403, 'self_target')
  return u
}

const isLocalOrigin = (o: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(o)

/** CORS for the app origin only (same origin as this deployment, or a localhost dev origin). `null` → origin not allowed. */
export function corsHeadersFor(request: Request): Record<string, string> | null {
  const origin = request.headers.get('Origin')
  const base: Record<string, string> = { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Expose-Headers': 'x-unq-proxy, x-unq-upstream-status, retry-after', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
  if (!origin) return base // same-origin navigation / non-browser caller
  let self = ''
  try { self = new URL(request.url).origin } catch { /* ignore */ }
  if (origin !== self && !isLocalOrigin(origin)) return null
  return { ...base, 'Access-Control-Allow-Origin': origin }
}

const json = (status: number, body: unknown, cors: Record<string, string>) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'x-unq-proxy': '1' } })

export function upstreamHeaders(input: unknown): Headers {
  const out = new Headers()
  if (input && typeof input === 'object') {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const name = k.trim().toLowerCase()
      if (!name || typeof v !== 'string' || !/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) continue
      if (STRIP_REQUEST_HEADERS.has(name) || STRIP_REQUEST_PREFIXES.some((p) => name.startsWith(p))) continue
      try { out.set(name, v) } catch { /* invalid header value */ }
    }
  }
  return out
}

export async function handleProxy(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const cors = corsHeadersFor(request)
  if (!cors) return new Response(JSON.stringify({ error: 'origin_not_allowed', message: 'This origin may not use the UnQStudio proxy.' }), { status: 403, headers: { 'Content-Type': 'application/json', Vary: 'Origin' } })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed', message: 'Use POST with a JSON envelope.' }, { ...cors, Allow: 'POST, OPTIONS' })

  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_ENVELOPE_BYTES) return json(413, { error: 'too_large', message: 'Request body is too large.' }, cors)
  let env: { url?: unknown; method?: unknown; headers?: unknown; body?: unknown }
  try {
    const text = await request.text()
    if (text.length > MAX_ENVELOPE_BYTES) return json(413, { error: 'too_large', message: 'Request body is too large.' }, cors)
    env = JSON.parse(text) as typeof env
    if (!env || typeof env !== 'object') throw new Error('not an object')
  } catch { return json(400, { error: 'bad_envelope', message: 'Body must be JSON: { url, method, headers, body }.' }, cors) }

  const method = String(env.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'POST') return json(405, { error: 'method_not_allowed', message: 'Only GET and POST can be proxied.' }, cors)
  let target: URL
  try { target = assertPublicHttpsUrl(env.url, new URL(request.url).host) } catch (e) {
    const pe = e instanceof ProxyError ? e : new ProxyError('Invalid target.')
    return json(pe.status, { error: pe.code, message: pe.message }, cors)
  }
  const headers = upstreamHeaders(env.headers)
  let body: string | undefined
  if (method === 'POST' && env.body !== undefined && env.body !== null) {
    body = typeof env.body === 'string' ? env.body : JSON.stringify(env.body)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  }

  let up: Response
  try { up = await fetchImpl(target.toString(), { method, headers, body, redirect: 'manual', signal: request.signal }) } catch (e) {
    if ((e as Error)?.name === 'AbortError') return new Response(null, { status: 499, headers: cors })
    return json(502, { error: 'upstream_unreachable', message: `Could not reach ${target.host}: ${e instanceof Error ? e.message : 'network error'}` }, cors)
  }
  if (up.status >= 300 && up.status < 400) {
    const loc = up.headers.get('location')
    return json(502, { error: 'upstream_redirect', message: `${target.host} redirected${loc ? ` to ${loc}` : ''}. Update the Base URL to the final address.` }, cors)
  }
  const out = new Headers(cors)
  for (const h of PASS_RESPONSE_HEADERS) { const v = up.headers.get(h); if (v) out.set(h, v) }
  if (!out.has('content-type')) out.set('content-type', 'application/octet-stream')
  out.set('Cache-Control', 'no-store, no-transform')
  out.set('X-Accel-Buffering', 'no')
  out.set('x-unq-proxy', '1')
  out.set('x-unq-upstream-status', String(up.status))
  // The upstream body stream is handed straight to the client — no buffering, so SSE tokens arrive as they are produced.
  return new Response(up.body, { status: up.status, statusText: up.statusText, headers: out })
}

export const onRequest: PagesFunction = ({ request }) => handleProxy(request)
