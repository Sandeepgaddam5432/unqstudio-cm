import { beforeEach, describe, expect, it } from 'vitest'
import { buildAnthropicRequest, buildGeminiRequest, buildOllamaRequest, buildOpenAIRequest, listModels, streamChat, thinkSplit } from './stream'
import { fetchLiveModels, liveEndpoint } from './modelFetcher'
import type { ProviderDef, ProviderKind } from './providers'
import type { StreamChunk, StreamRequest } from './types'
import { cleanHeaders, parseHeaders, protocolInfo, slugify, toProviderDef, uniqueId, validateCustomProvider } from './customProviders'
import { useCustomProviders } from '@/store/customProviders'

const prov = (kind: ProviderKind, extra: Partial<ProviderDef> = {}): ProviderDef => ({ id: 'x', name: 'X', kind, baseUrl: 'https://gw.example.com', models: [], blurb: '', ...extra })
const enc = new TextEncoder()
const streamOf = (txt: string, chunk = 17) => new ReadableStream<Uint8Array>({ start(c) { const b = enc.encode(txt); for (let i = 0; i < b.length; i += chunk) c.enqueue(b.slice(i, i + chunk)); c.close() } })
const fakeFetch = (txt: string, seen: { url?: string; init?: RequestInit } = {}): typeof fetch => (async (u: string, init?: RequestInit) => { seen.url = String(u); seen.init = init; return new Response(streamOf(txt), { status: 200 }) }) as unknown as typeof fetch
const req = (p: ProviderDef, extra: Partial<StreamRequest> = {}): StreamRequest => ({ provider: p, model: 'm1', apiKey: 'KEY', messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: [{ type: 'text', text: 'see' }, { type: 'image', dataUrl: 'data:image/png;base64,AAAA' }] }], ...extra })
const collect = async (r: StreamRequest) => { const out: StreamChunk[] = []; for await (const c of streamChat(r)) out.push(c); return out }
const join = (cs: StreamChunk[], t: 'text' | 'reasoning') => cs.filter((c) => c.type === t).map((c) => (c as { text: string }).text).join('')
const hdrs = (i?: RequestInit) => i?.headers as Record<string, string>

describe('OpenAI-compatible adapter', () => {
  it('POST {base}/chat/completions with bearer + custom headers merged', () => {
    const { url, init } = buildOpenAIRequest(req(prov('openai', { headers: { 'X-Org': 'acme' } })))
    expect(url).toBe('https://gw.example.com/chat/completions')
    expect(hdrs(init)).toMatchObject({ Authorization: 'Bearer KEY', 'X-Org': 'acme' })
  })
  it('streams SSE text + usage', async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\ndata: [DONE]\n\n'
    const cs = await collect(req(prov('openai'), { fetchImpl: fakeFetch(sse) }))
    expect(join(cs, 'text')).toBe('Hello'); expect(cs.some((c) => c.type === 'usage')).toBe(true)
  })
})

describe('Anthropic Messages adapter', () => {
  it('normalises /v1, merges headers, honours the browser-access toggle', () => {
    const a = buildAnthropicRequest(req(prov('anthropic', { headers: { 'X-Extra': '1' } })))
    expect(a.url).toBe('https://gw.example.com/v1/messages')
    expect(hdrs(a.init)).toMatchObject({ 'x-api-key': 'KEY', 'anthropic-dangerous-direct-browser-access': 'true', 'X-Extra': '1' })
    expect(buildAnthropicRequest(req(prov('anthropic', { baseUrl: 'https://api.anthropic.com/v1' }))).url).toBe('https://api.anthropic.com/v1/messages')
    expect(hdrs(buildAnthropicRequest(req(prov('anthropic', { browserAccess: false }))).init)['anthropic-dangerous-direct-browser-access']).toBeUndefined()
    const body = JSON.parse(String(a.init.body)); expect(body.system).toBe('be brief'); expect(body.messages[2].content[1].type).toBe('image')
  })
  it('streams SSE deltas and stops on message_stop', async () => {
    const sse = 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":4}}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi "}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"there"}}\n\nevent: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'
    const cs = await collect(req(prov('anthropic'), { fetchImpl: fakeFetch(sse) }))
    expect(join(cs, 'text')).toBe('Hi there'); expect(cs.find((c) => c.type === 'usage')).toMatchObject({ usage: { inputTokens: 4, outputTokens: 2 } })
  })
})

describe('Gemini native adapter', () => {
  it('builds streamGenerateContent URL, contents, inlineData, systemInstruction, headers', () => {
    const { url, init } = buildGeminiRequest(req(prov('gemini', { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', headers: { 'X-Foo': 'bar' } }), { model: 'models/gemini-2.5-pro', temperature: 0.3, maxTokens: 99 }))
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse&key=KEY')
    const b = JSON.parse(String(init.body))
    expect(b.systemInstruction.parts[0].text).toBe('be brief'); expect(b.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user'])
    expect(b.contents[2].parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: 'AAAA' } }); expect(b.generationConfig).toEqual({ temperature: 0.3, maxOutputTokens: 99 })
    expect(hdrs(init)['X-Foo']).toBe('bar')
  })
  it('streams text, thought parts, <think> tags split across chunks, and usageMetadata', async () => {
    const ev = (parts: unknown[], extra: object = {}) => `data: ${JSON.stringify({ candidates: [{ content: { parts } }], ...extra })}\n\n`
    const sse = ev([{ text: 'considering', thought: true }]) + ev([{ text: '<thi' }]) + ev([{ text: 'nk>plan</th' }]) + ev([{ text: 'ink>Hel' }]) + ev([{ text: 'lo' }], { usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3, thoughtsTokenCount: 2 } })
    const cs = await collect(req(prov('gemini'), { fetchImpl: fakeFetch(sse, {}) }))
    expect(join(cs, 'reasoning')).toBe('consideringplan'); expect(join(cs, 'text')).toBe('Hello')
    expect(cs.at(-1)).toEqual({ type: 'usage', usage: { inputTokens: 7, outputTokens: 5 } })
  })
  it('surfaces API errors', async () => {
    await expect(collect(req(prov('gemini'), { fetchImpl: fakeFetch('data: {"error":{"message":"quota"}}\n\n') }))).rejects.toThrow('quota')
  })
  it('thinkSplit flushes a dangling partial tag as text', () => {
    const st = { inThink: false, pending: '' }
    expect(thinkSplit(st, 'a <th')).toEqual([{ type: 'text', text: 'a ' }]); expect(thinkSplit(st, '', true)).toEqual([{ type: 'text', text: '<th' }])
  })
})

describe('Ollama native adapter', () => {
  it('builds /api/chat from /v1 or bare roots with base64 images', () => {
    const { url, init } = buildOllamaRequest(req(prov('ollama', { baseUrl: 'http://localhost:11434/v1' }), { temperature: 0.1, maxTokens: 50 }))
    expect(url).toBe('http://localhost:11434/api/chat')
    const b = JSON.parse(String(init.body)); expect(b.messages[3].images).toEqual(['AAAA']); expect(b.options).toEqual({ temperature: 0.1, num_predict: 50 }); expect(b.stream).toBe(true)
  })
  it('streams NDJSON with thinking, text and final usage (lines split across chunks)', async () => {
    const nd = [{ message: { role: 'assistant', content: '', thinking: 'hmm' } }, { message: { content: 'Hel' } }, { message: { content: 'lo' } }, { done: true, prompt_eval_count: 9, eval_count: 4, message: { content: '' } }].map((o) => JSON.stringify(o)).join('\n') + '\n'
    const cs = await collect(req(prov('ollama', { baseUrl: 'http://localhost:11434' }), { fetchImpl: fakeFetch(nd, {}) }))
    expect(join(cs, 'reasoning')).toBe('hmm'); expect(join(cs, 'text')).toBe('Hello'); expect(cs.at(-1)).toEqual({ type: 'usage', usage: { inputTokens: 9, outputTokens: 4 } })
  })
  it('surfaces NDJSON errors', async () => { await expect(collect(req(prov('ollama'), { fetchImpl: fakeFetch('{"error":"model not found"}\n') }))).rejects.toThrow('model not found') })
})

describe('/models endpoints for all 4 protocols (+ custom headers)', () => {
  const H = { 'X-Tenant': 't1' }
  it('openai: GET {base}/models', () => {
    const e = liveEndpoint({ id: 'x', kind: 'openai', baseUrl: 'https://gw.example.com/v1/', headers: H }, 'K')
    expect(e.url).toBe('https://gw.example.com/v1/models'); expect(e.headers).toMatchObject({ Authorization: 'Bearer K', ...H })
  })
  it('anthropic: GET /v1/models with version header, toggle and headers', () => {
    const e = liveEndpoint({ id: 'x', kind: 'anthropic', baseUrl: 'https://gw.example.com', headers: H }, 'K')
    expect(e.url).toBe('https://gw.example.com/v1/models?limit=1000'); expect(e.headers).toMatchObject({ 'x-api-key': 'K', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', ...H })
    expect(liveEndpoint({ id: 'x', kind: 'anthropic', baseUrl: 'https://a/v1', browserAccess: false }, 'K').headers['anthropic-dangerous-direct-browser-access']).toBeUndefined()
  })
  it('gemini: GET /v1beta/models on a custom root', () => {
    expect(liveEndpoint({ id: 'x', kind: 'gemini', baseUrl: 'https://proxy.example.com/gem', headers: H }, 'K').url).toBe('https://proxy.example.com/gem/v1beta/models?pageSize=1000&key=K')
    expect(liveEndpoint({ id: 'x', kind: 'gemini', baseUrl: '' }, 'K').url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=K')
  })
  it('ollama: GET /api/tags', () => { expect(liveEndpoint({ id: 'x', kind: 'ollama', baseUrl: 'http://box:11434/v1' }).url).toBe('http://box:11434/api/tags') })

  const json = (b: unknown, seen: { url?: string; h?: HeadersInit }) => (async (u: string, i?: RequestInit) => { seen.url = u; seen.h = i?.headers; return new Response(JSON.stringify(b), { status: 200 }) }) as unknown as typeof fetch
  it.each([
    ['openai', { data: [{ id: 'a' }, { id: 'b' }] }, 2], ['anthropic', { data: [{ id: 'claude-x', display_name: 'Claude X' }] }, 1],
    ['gemini', { models: [{ name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] }, 1],
    ['ollama', { models: [{ name: 'llama3:8b' }, { name: 'qwen2.5' }] }, 2],
  ] as [ProviderKind, unknown, number][])('%s: live fetch parses the real response shape', async (kind, body, n) => {
    const seen: { url?: string; h?: HeadersInit } = {}
    const r = await fetchLiveModels({ provider: { id: 'c', kind, baseUrl: 'https://gw.example.com', headers: H, noKey: true }, apiKey: 'K', fetchImpl: json(body, seen) })
    expect(r.ok && r.models.length).toBe(n); expect(JSON.stringify(seen.h)).toContain('X-Tenant')
  })
  it('listModels (connection test) delegates to the same endpoints', async () => {
    const seen: { url?: string } = {}
    const ids = await listModels(prov('ollama', { baseUrl: 'http://box:11434' }), undefined, undefined, (async (u: string) => { seen.url = u; return new Response(JSON.stringify({ models: [{ name: 'm' }] }), { status: 200 }) }) as unknown as typeof fetch)
    expect(ids).toEqual(['m']); expect(seen.url).toBe('http://box:11434/api/tags')
  })
})

describe('custom provider helpers', () => {
  it('slugify / uniqueId / validation / headers', () => {
    expect(slugify('My Gateway!!')).toBe('my-gateway'); expect(uniqueId('My Gateway', ['custom:my-gateway'])).toBe('custom:my-gateway-2')
    expect(validateCustomProvider({ name: '', baseUrl: 'https://a', kind: 'openai' })).toMatch(/name/); expect(validateCustomProvider({ name: 'a', baseUrl: 'ftp://a', kind: 'openai' })).toMatch(/http/)
    expect(validateCustomProvider({ name: 'a', baseUrl: 'nonsense', kind: 'openai' })).toMatch(/valid/); expect(validateCustomProvider({ name: 'a', baseUrl: 'http://localhost:11434', kind: 'ollama' })).toBeNull()
    expect(cleanHeaders([{ k: ' X-A ', v: ' 1 ' }, { k: '', v: 'z' }, { k: 'bad name', v: 'z' }])).toEqual({ 'X-A': '1' }); expect(parseHeaders('{"A":"1","B":2}')).toEqual({ A: '1' }); expect(parseHeaders('nope')).toEqual({})
    expect(PROTOCOLS_KINDS()).toEqual(['openai', 'anthropic', 'gemini', 'ollama']); expect(protocolInfo('gemini').label).toMatch(/Gemini/)
  })
  it('toProviderDef: local detection, headers, anthropic toggle', () => {
    const base = { id: 'custom:a', name: 'A', kind: 'ollama' as const, baseUrl: 'http://localhost:11434', brand: 'ollama', accent: '#000', models: ['m'], noKey: true, browserAccess: true, headerNames: [], createdAt: 1 }
    expect(toProviderDef(base)).toMatchObject({ custom: true, local: true, compat: 'local', noKey: true, models: [{ id: 'm' }] })
    expect(toProviderDef({ ...base, kind: 'anthropic', baseUrl: 'https://x.io', browserAccess: false }, { A: '1' })).toMatchObject({ browserAccess: false, headers: { A: '1' }, compat: 'browser-ready' })
  })
})
const PROTOCOLS_KINDS = () => (['openai', 'anthropic', 'gemini', 'ollama'] as ProviderKind[]).filter((k) => protocolInfo(k).kind === k)

describe('custom provider CRUD persistence (store)', () => {
  beforeEach(() => { localStorage.clear(); useCustomProviders.setState({ providers: [], modalOpen: false, editingId: null }) })
  const draft = { name: 'Acme GW', kind: 'gemini' as const, baseUrl: 'https://gw.acme.io', brand: 'gemini', accent: '#6366f1', models: ['m1'], noKey: false, browserAccess: true, headerNames: ['X-A'] }
  it('add → update → duplicate → remove, persisted to localStorage WITHOUT secrets', () => {
    const s = useCustomProviders.getState()
    const a = s.add(draft); expect(a.id).toBe('custom:acme-gw')
    s.update(a.id, { name: 'Acme Prime', models: ['m1', 'm2'] })
    expect(useCustomProviders.getState().providers[0]).toMatchObject({ name: 'Acme Prime', id: 'custom:acme-gw', models: ['m1', 'm2'] })
    const d = useCustomProviders.getState().duplicate(a.id)!
    expect(d.id).not.toBe(a.id); expect(d.name).toMatch(/\(copy\)/); expect(useCustomProviders.getState().providers).toHaveLength(2)
    const raw = localStorage.getItem('unq.customProviders.v1')!
    expect(raw).toContain('Acme Prime'); expect(raw).not.toMatch(/apiKey|sk-|modalOpen/)
    useCustomProviders.getState().remove(a.id)
    expect(useCustomProviders.getState().providers.map((p) => p.id)).toEqual([d.id])
    expect(JSON.parse(localStorage.getItem('unq.customProviders.v1')!).state.providers).toHaveLength(1)
  })
  it('modal open/edit state', () => {
    const a = useCustomProviders.getState().add(draft)
    useCustomProviders.getState().openEdit(a.id); expect(useCustomProviders.getState()).toMatchObject({ modalOpen: true, editingId: a.id })
    useCustomProviders.getState().closeModal(); expect(useCustomProviders.getState().modalOpen).toBe(false)
  })
})
