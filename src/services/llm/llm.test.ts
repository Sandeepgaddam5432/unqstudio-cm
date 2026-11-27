// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ALLOWED_PORTS, assertPublicHttpsUrl, corsHeadersFor, handleProxy, isPrivateIPv4, upstreamHeaders } from '../../../functions/api/proxy'
import { chatCompletionsUrl, effectiveViaProxy, hasVersionSegment, isLocalUrl, modelsUrlCandidates, normalizeBaseUrl, shouldProxyByDefault } from './urls'
import { createProxiedFetch } from './proxy'
import { liveEndpoints } from '@/core/ai/modelFetcher'
import { fetchLiveModels } from '@/core/ai/modelFetcher'
import { toProviderDef } from '@/core/ai/customProviders'

const ORIGIN = 'https://unqstudio-cm.pages.dev'
const req = (body: unknown, init: RequestInit = {}) => new Request(`${ORIGIN}/api/proxy`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(init.headers ?? {}) }, body: typeof body === 'string' ? body : JSON.stringify(body), ...init })

describe('SSRF guard (assertPublicHttpsUrl)', () => {
  it('accepts public https hosts', () => {
    expect(assertPublicHttpsUrl('https://api.numes.ai/api/v1/models').host).toBe('api.numes.ai')
    expect(assertPublicHttpsUrl('https://8.8.8.8/v1').hostname).toBe('8.8.8.8')
    expect(assertPublicHttpsUrl('https://gateway.example.com:8443/v1').port).toBe('8443')
  })
  it.each([
    'http://api.example.com/v1', 'ftp://example.com', 'https://localhost/v1', 'https://sub.localhost/x', 'https://127.0.0.1/', 'https://127.1/', 'https://2130706433/', 'https://0x7f.0.0.1/',
    'https://10.0.0.5/', 'https://172.16.4.4/', 'https://172.31.255.255/', 'https://192.168.1.1/', 'https://169.254.169.254/latest/meta-data', 'https://100.64.0.1/', 'https://0.0.0.0/',
    'https://[::1]/', 'https://[fd00::1]/', 'https://[::ffff:127.0.0.1]/', 'https://metadata.google.internal/', 'https://intranet/', 'https://printer.local/', 'https://kubernetes.default.svc/',
    'https://user:pw@api.example.com/', 'https://api.example.com:22/', 'https://api.example.com:8080/', 'not a url', '',
  ])('blocks %s', (u) => { expect(() => assertPublicHttpsUrl(u)).toThrow() })
  it('blocks targeting the proxy itself and non-strings', () => {
    expect(() => assertPublicHttpsUrl('https://unqstudio-cm.pages.dev/api/proxy', 'unqstudio-cm.pages.dev')).toThrow(/itself/)
    expect(() => assertPublicHttpsUrl(undefined)).toThrow()
  })
  it('classifies private IPv4 ranges', () => {
    for (const ip of [[10, 1, 1, 1], [127, 0, 0, 1], [169, 254, 1, 1], [172, 20, 0, 1], [192, 168, 0, 1], [100, 100, 0, 1], [224, 0, 0, 1], [198, 18, 0, 1]]) expect(isPrivateIPv4(ip)).toBe(true)
    for (const ip of [[8, 8, 8, 8], [1, 1, 1, 1], [172, 32, 0, 1], [172, 15, 0, 1], [100, 63, 0, 1]]) expect(isPrivateIPv4(ip)).toBe(false)
    expect(ALLOWED_PORTS.has('443')).toBe(true)
  })
})

describe('proxy handler', () => {
  it('CORS: reflects the app origin and localhost dev only', async () => {
    expect(corsHeadersFor(new Request(`${ORIGIN}/api/proxy`, { headers: { Origin: ORIGIN } }))!['Access-Control-Allow-Origin']).toBe(ORIGIN)
    expect(corsHeadersFor(new Request(`${ORIGIN}/api/proxy`, { headers: { Origin: 'http://localhost:5173' } }))!['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(corsHeadersFor(new Request(`${ORIGIN}/api/proxy`, { headers: { Origin: 'https://evil.example' } }))).toBeNull()
    const pre = await handleProxy(new Request(`${ORIGIN}/api/proxy`, { method: 'OPTIONS', headers: { Origin: ORIGIN } }))
    expect(pre.status).toBe(204); expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    const bad = await handleProxy(req({ url: 'https://api.example.com' }, { headers: { Origin: 'https://evil.example' } }))
    expect(bad.status).toBe(403)
  })
  it('rejects GET, bad envelopes, bad methods and private targets without calling upstream', async () => {
    let calls = 0
    const f = (async () => { calls++; return new Response('x') }) as typeof fetch
    expect((await handleProxy(new Request(`${ORIGIN}/api/proxy`, { headers: { Origin: ORIGIN } }), f)).status).toBe(405)
    expect((await handleProxy(req('nope'), f)).status).toBe(400)
    expect((await handleProxy(req({ url: 'https://api.example.com', method: 'DELETE' }), f)).status).toBe(405)
    expect((await handleProxy(req({ url: 'https://169.254.169.254/latest', method: 'GET' }), f)).status).toBe(403)
    expect((await handleProxy(req({ url: 'http://api.example.com/v1/models' }), f)).status).toBe(400)
    expect(calls).toBe(0)
  })
  it('forwards method, auth headers and JSON body; strips hop-by-hop / cookie / cf headers; forwards upstream status + error text verbatim', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response('{"error":{"message":"Invalid API key"}}', { status: 401, headers: { 'content-type': 'application/json' } }) }) as unknown as typeof fetch
    const res = await handleProxy(req({ url: 'https://api.numes.ai/api/v1/chat/completions', method: 'POST', headers: { Authorization: 'Bearer sk-1', 'x-api-key': 'k', 'X-Custom': 'v', Cookie: 'a=b', Host: 'evil', 'cf-connecting-ip': '1.1.1.1', Origin: 'x' }, body: { model: 'm', stream: true } }), f)
    expect(res.status).toBe(401)
    expect(await res.text()).toContain('Invalid API key')
    expect(res.headers.get('x-unq-upstream-status')).toBe('401')
    expect(seen!.url).toBe('https://api.numes.ai/api/v1/chat/completions')
    const h = seen!.init.headers as Headers
    expect(h.get('authorization')).toBe('Bearer sk-1'); expect(h.get('x-api-key')).toBe('k'); expect(h.get('x-custom')).toBe('v')
    expect(h.has('cookie')).toBe(false); expect(h.has('host')).toBe(false); expect(h.has('cf-connecting-ip')).toBe(false); expect(h.has('origin')).toBe(false)
    expect(JSON.parse(seen!.init.body as string)).toEqual({ model: 'm', stream: true })
    expect(seen!.init.redirect).toBe('manual')
  })
  it('STREAMS text/event-stream through without buffering', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const enc = new TextEncoder()
    const f = (async () => new Response(new ReadableStream({
      async start(c) { c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n')); await gate; c.enqueue(enc.encode('data: [DONE]\n\n')); c.close() },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } })) as unknown as typeof fetch
    const res = await handleProxy(req({ url: 'https://api.numes.ai/v1/chat/completions', method: 'POST', body: '{}' }), f)
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    const reader = res.body!.getReader()
    const first = await reader.read() // arrives while the upstream is still open ⇒ not buffered
    expect(new TextDecoder().decode(first.value)).toContain('"Hel"')
    release()
    const second = await reader.read()
    expect(new TextDecoder().decode(second.value)).toContain('[DONE]')
    expect((await reader.read()).done).toBe(true)
  })
  it('does not follow upstream redirects', async () => {
    const f = (async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })) as unknown as typeof fetch
    const res = await handleProxy(req({ url: 'https://api.example.com/v1/models', method: 'GET' }), f)
    expect(res.status).toBe(502)
    expect((await res.json() as { error: string }).error).toBe('upstream_redirect')
  })
  it('reports an unreachable upstream as 502 JSON', async () => {
    const f = (async () => { throw new TypeError('dns') }) as unknown as typeof fetch
    expect((await handleProxy(req({ url: 'https://api.example.com/v1/models' }), f)).status).toBe(502)
  })
  it('upstreamHeaders ignores junk', () => { expect([...upstreamHeaders({ 'bad name': 'x', ok: 'y', n: 3 }).keys()]).toEqual(['ok']) })
})

describe('URL normalisation + routing defaults', () => {
  it('normalizeBaseUrl strips slashes, pasted endpoints, query', () => {
    expect(normalizeBaseUrl(' https://api.numes.ai/api/v1/ ')).toBe('https://api.numes.ai/api/v1')
    expect(normalizeBaseUrl('https://x.ai/v1/chat/completions')).toBe('https://x.ai/v1')
    expect(normalizeBaseUrl('https://x.ai/v1/models?x=1#h')).toBe('https://x.ai/v1')
    expect(normalizeBaseUrl('https://x.ai///')).toBe('https://x.ai')
  })
  it('probes {base}/models then {base}/v1/models only when unversioned', () => {
    expect(modelsUrlCandidates('https://x.ai')).toEqual(['https://x.ai/models', 'https://x.ai/v1/models'])
    expect(modelsUrlCandidates('https://x.ai/api/v1/')).toEqual(['https://x.ai/api/v1/models'])
    expect(hasVersionSegment('https://x.ai/v1beta')).toBe(true)
    expect(chatCompletionsUrl('https://x.ai/v1/')).toBe('https://x.ai/v1/chat/completions')
    const eps = liveEndpoints({ id: 'custom:x', kind: 'openai', baseUrl: 'https://x.ai/' }, 'k')
    expect(eps.map((e) => e.url)).toEqual(['https://x.ai/models', 'https://x.ai/v1/models'])
    expect(eps[1]!.base).toBe('https://x.ai/v1')
  })
  it('proxy defaults: ON for non-local https, OFF for localhost / http; explicit choice wins', () => {
    expect(shouldProxyByDefault('https://api.numes.ai/api/v1')).toBe(true)
    expect(shouldProxyByDefault('http://localhost:11434')).toBe(false)
    expect(shouldProxyByDefault('https://localhost:8443/v1')).toBe(false)
    expect(shouldProxyByDefault('http://127.0.0.1:8080')).toBe(false)
    expect(shouldProxyByDefault('http://example.com')).toBe(false)
    expect(isLocalUrl('http://[::1]:3000')).toBe(true)
    expect(effectiveViaProxy({ baseUrl: 'https://a.b/v1' })).toBe(true)
    expect(effectiveViaProxy({ baseUrl: 'https://a.b/v1', viaProxy: false })).toBe(false)
    expect(toProviderDef({ id: 'custom:n', name: 'N', kind: 'openai', baseUrl: 'https://api.numes.ai/api/v1', brand: 'custom', accent: '#fff', models: [], noKey: false, browserAccess: true, headerNames: [], createdAt: 0 }).viaProxy).toBe(true)
    expect(toProviderDef({ id: 'custom:l', name: 'L', kind: 'openai', baseUrl: 'http://localhost:1234/v1', brand: 'custom', accent: '#fff', models: [], noKey: true, browserAccess: true, headerNames: [], createdAt: 0 }).viaProxy).toBe(false)
  })
})

describe('createProxiedFetch', () => {
  it('wraps the call in an envelope and returns the streaming response', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const base = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('ok', { headers: { 'x-unq-proxy': '1' } }) }) as unknown as typeof fetch
    const f = createProxiedFetch({ baseFetch: base })
    const res = await f('https://api.numes.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' }, body: '{"a":1}' })
    expect(await res.text()).toBe('ok')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('/api/proxy')
    const env = JSON.parse(calls[0]!.init.body as string)
    expect(env).toMatchObject({ url: 'https://api.numes.ai/api/v1/chat/completions', method: 'POST', body: '{"a":1}' })
    expect(env.headers.authorization).toBe('Bearer k')
  })
  it('goes direct for localhost and falls back direct when the host has no proxy function', async () => {
    const seen: string[] = []
    const base = (async (url: string) => { seen.push(url); return new Response('<html>spa</html>') }) as unknown as typeof fetch
    const f = createProxiedFetch({ baseFetch: base })
    await f('http://localhost:11434/api/tags')
    await f('https://api.numes.ai/v1/models')
    expect(seen).toEqual(['http://localhost:11434/api/tags', '/api/proxy', 'https://api.numes.ai/v1/models'])
  })
  it('fetchLiveModels probes {base}/models then {base}/v1/models and reports the resolved base', async () => {
    const urls: string[] = []
    const f = (async (u: string) => { urls.push(u); return u.endsWith('/v1/models') ? new Response(JSON.stringify({ data: [{ id: 'gpt-x' }] })) : new Response('nf', { status: 404 }) }) as unknown as typeof fetch
    const out = await fetchLiveModels({ provider: { id: 'custom:n', kind: 'openai', baseUrl: 'https://gw.example.com/' }, apiKey: 'k', fetchImpl: f })
    expect(urls).toEqual(['https://gw.example.com/models', 'https://gw.example.com/v1/models'])
    expect(out.ok && out.resolvedBase).toBe('https://gw.example.com/v1')
  })
})
