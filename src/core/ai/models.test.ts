import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { classifyProvider, normalizeModelsDev, isRegistry, countModels, KNOWN_API } from './modelsDev'
import { enrichModels, fetchLiveModels, liveEndpoint, parseAnthropicModels, parseGeminiModels, parseOllamaModels, parseOpenAIModels, findCatalogModel, catalogModels } from './modelFetcher'
import { fetchRegistry, loadRegistry, mergeRegistries, readCache, isFresh, _resetRegistryDb, REGISTRY_TTL_MS } from './modelsRegistry'
import { handleModelsDev } from '../../../functions/api/models-dev'

const RAW = {
  openai: { id: 'openai', name: 'OpenAI', npm: '@ai-sdk/openai', env: ['OPENAI_API_KEY'], doc: 'https://platform.openai.com', models: {
    'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o', reasoning: false, tool_call: true, release_date: '2024-05-13', limit: { context: 128000, output: 16384 }, cost: { input: 2.5, output: 10 }, modalities: { input: ['text', 'image'], output: ['text'] } },
    'old': { id: 'old', name: 'Old', status: 'deprecated' },
  } },
  anthropic: { id: 'anthropic', name: 'Anthropic', npm: '@ai-sdk/anthropic', models: { 'claude-sonnet-4-5': { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', reasoning: true, release_date: '2025-09-29', limit: { context: 200000, output: 64000 } } } },
  'amazon-bedrock': { id: 'amazon-bedrock', name: 'Bedrock', npm: '@ai-sdk/amazon-bedrock', models: { m: { id: 'm', name: 'M' } } },
  futurecloud: { id: 'futurecloud', name: 'FutureCloud', api: 'https://api.futurecloud.ai/v1', npm: '@ai-sdk/openai-compatible', models: { 'fc-1': { id: 'fc-1', name: 'FC One', limit: { context: 32000 } } } },
  mystery: { id: 'mystery', name: 'Mystery', models: { x: { id: 'x', name: 'X' } } },
  localthing: { id: 'localthing', name: 'Local', api: 'http://localhost:8080/v1', models: { y: { id: 'y', name: 'Y' } } },
  broken: null,
}

describe('provider directory normalizer', () => {
  const reg = normalizeModelsDev(RAW, { now: new Date('2026-01-01T00:00:00Z') })
  it('normalizes providers/models, drops deprecated, adds logo + capability flags', () => {
    const o = reg.providers.find((p) => p.id === 'openai')!
    expect(o.logo).toBe('https://models.dev/logos/openai.svg')
    expect(o.api).toBe(KNOWN_API.openai)
    expect(o.models).toHaveLength(1)
    expect(o.models[0]).toMatchObject({ id: 'gpt-4o', context: 128000, output: 16384, vision: true, tool_call: true, cost: { input: 2.5, output: 10 } })
    expect(reg.generatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(isRegistry(reg)).toBe(true)
    expect(countModels(reg)).toBe(6)
  })
  it('tags compatibility honestly', () => {
    const c = (id: string) => reg.providers.find((p) => p.id === id)!.compat
    expect(c('openai')).toBe('browser-ready')
    expect(c('futurecloud')).toBe('browser-ready') // brand-new provider works with zero code changes
    expect(c('amazon-bedrock')).toBe('requires-proxy')
    expect(c('mystery')).toBe('requires-proxy') // no known base URL
    expect(c('localthing')).toBe('local')
    expect(c('ollama')).toBe('local')
    expect(c('lmstudio')).toBe('local')
    expect(reg.providers.find((p) => p.id === 'anthropic')!.kind).toBe('anthropic')
  })
  it('classifyProvider handles vertex/azure/anthropic-compatible', () => {
    expect(classifyProvider('google-vertex', '@ai-sdk/google-vertex').compat).toBe('requires-proxy')
    expect(classifyProvider('azure', '@ai-sdk/azure', 'https://x.azure.com').compat).toBe('requires-proxy')
    expect(classifyProvider('minimax', '@ai-sdk/anthropic', 'https://api.minimax.io/anthropic/v1')).toMatchObject({ kind: 'anthropic', compat: 'browser-ready' })
  })
  it('survives garbage input', () => { expect(normalizeModelsDev(null).providers.map((p) => p.id).sort()).toEqual(['lmstudio', 'ollama']) })
})

describe('live /models parsers & endpoints', () => {
  it('OpenAI-compatible', () => {
    expect(parseOpenAIModels({ data: [{ id: 'a' }, { id: 'b', name: 'B', context_length: 8000 }, {}] })).toEqual([{ id: 'a', name: undefined, context: undefined }, { id: 'b', name: 'B', context: 8000 }])
    expect(parseOpenAIModels([{ id: 'x' }]).map((m) => m.id)).toEqual(['x'])
    const ep = liveEndpoint({ id: 'groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1/' }, 'k')
    expect(ep.url).toBe('https://api.groq.com/openai/v1/models')
    expect(ep.headers).toEqual({ Authorization: 'Bearer k' })
  })
  it('Gemini strips models/ prefix, keeps generateContent only, key in query', () => {
    const out = parseGeminiModels({ models: [{ name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', inputTokenLimit: 1048576, supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }] })
    expect(out).toEqual([{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', context: 1048576, output: undefined }])
    const ep = liveEndpoint({ id: 'gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' }, 'a b')
    expect(ep.url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=a%20b')
    expect(ep.headers).toEqual({})
  })
  it('Anthropic headers incl. direct-browser-access', () => {
    expect(parseAnthropicModels({ data: [{ id: 'claude-x', display_name: 'Claude X' }] })).toEqual([{ id: 'claude-x', name: 'Claude X' }])
    const ep = liveEndpoint({ id: 'anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' }, 'ak')
    expect(ep.url).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect(ep.headers).toMatchObject({ 'x-api-key': 'ak', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' })
  })
  it('Ollama uses /api/tags without /v1', () => {
    expect(parseOllamaModels({ models: [{ name: 'llama3:8b' }, { model: 'qwen2.5' }] }).map((m) => m.id)).toEqual(['llama3:8b', 'qwen2.5'])
    expect(liveEndpoint({ id: 'ollama', kind: 'openai', baseUrl: 'http://localhost:11434/v1' }).url).toBe('http://localhost:11434/api/tags')
  })
})

describe('enrichment + fetchLiveModels fallback', () => {
  const rp = normalizeModelsDev(RAW).providers.find((p) => p.id === 'openai')!
  it('enriches live ids with catalog metadata and matches loosely', () => {
    const out = enrichModels([{ id: 'gpt-4o' }, { id: 'GPT-4O' }, { id: 'brand-new-model' }, { id: 'gpt-4o' }], rp.models)
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({ name: 'GPT-4o', context: 128000, vision: true, source: 'live' })
    expect(out[1].name).toBe('GPT-4o')
    expect(out[2]).toMatchObject({ id: 'brand-new-model', name: 'brand-new-model' })
    expect(findCatalogModel('openai/gpt-4o:free', rp.models)?.id).toBe('gpt-4o')
  })
  const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch
  const target = { id: 'openai', kind: 'openai' as const, baseUrl: 'https://api.openai.com/v1' }
  it('success path is live + enriched', async () => {
    const r = await fetchLiveModels({ provider: target, apiKey: 'k', registryProvider: rp, fetchImpl: ok({ data: [{ id: 'gpt-4o' }, { id: 'o9' }] }) })
    expect(r.ok && r.source).toBe('live')
    expect(r.models.map((m) => m.id)).toEqual(['gpt-4o', 'o9'])
  })
  it('falls back to the catalog on missing key / 401 / CORS / empty', async () => {
    const nokey = await fetchLiveModels({ provider: target, registryProvider: rp, fetchImpl: ok({}) })
    expect(nokey).toMatchObject({ ok: false, code: 'nokey', source: 'catalog' })
    expect(nokey.models).toEqual(catalogModels(rp))
    const f401 = (async () => new Response('no', { status: 401 })) as unknown as typeof fetch
    expect(await fetchLiveModels({ provider: target, apiKey: 'bad', registryProvider: rp, fetchImpl: f401 })).toMatchObject({ ok: false, code: 'http' })
    const cors = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    const net = await fetchLiveModels({ provider: target, apiKey: 'k', registryProvider: rp, fetchImpl: cors })
    expect(net).toMatchObject({ ok: false, code: 'network' })
    expect(net.models.length).toBe(1)
    expect(await fetchLiveModels({ provider: target, apiKey: 'k', registryProvider: rp, fetchImpl: ok({ data: [] }) })).toMatchObject({ ok: false, code: 'empty' })
  })
  it('keyless local providers fetch without a key', async () => {
    const r = await fetchLiveModels({ provider: { id: 'ollama', kind: 'openai', baseUrl: 'http://localhost:11434/v1', noKey: true }, fetchImpl: ok({ models: [{ name: 'llama3' }] }) })
    expect(r.ok).toBe(true)
  })
})

describe('registry cache (IndexedDB) + tiered fetch', () => {
  beforeEach(() => { globalThis.indexedDB = new IDBFactory(); _resetRegistryDb() })
  const bigRaw = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`p${i}`, { id: `p${i}`, name: `P${i}`, api: `https://p${i}.ai/v1`, models: { m: { id: 'm', name: 'M' } } }]))
  const small = normalizeModelsDev(RAW)
  const routes = (map: Record<string, unknown | null>) => (async (url: string) => {
    const hit = Object.entries(map).find(([k]) => String(url).includes(k))
    if (!hit || hit[1] === null) return new Response('nope', { status: 404 })
    return new Response(JSON.stringify(hit[1]), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  const big = { ...small, providers: Array.from({ length: 12 }, (_, i) => ({ ...small.providers[0], id: `p${i}`, name: `P${i}` })) }

  it('tier order: edge → directory → bundled', async () => {
    expect((await fetchRegistry(routes({ 'api/models-dev': big }))).source).toBe('edge')
    expect((await fetchRegistry(routes({ 'api/models-dev': null, 'models.dev/api.json': bigRaw }))).source).toBe('directory')
    expect((await fetchRegistry(routes({ 'api/models-dev': null, 'models.dev/api.json': null, 'catalog-snapshot.json': big }))).source).toBe('bundled')
  })
  it('caches with 24h TTL, forces refresh, serves stale on total failure', async () => {
    const t0 = 1_000_000
    const a = await loadRegistry({ fetchImpl: routes({ 'api/models-dev': big }), now: t0 })
    expect(a.source).toBe('edge')
    expect((await readCache())?.source).toBe('edge')
    const b = await loadRegistry({ fetchImpl: routes({}), now: t0 + 1000 })
    expect(b.source).toBe('cache')
    const dead = routes({})
    const c = await loadRegistry({ fetchImpl: dead, now: t0 + REGISTRY_TTL_MS + 5 })
    expect(c.stale).toBe(true)
    expect(isFresh({ ...a }, t0 + REGISTRY_TTL_MS + 5)).toBe(false)
    const d = await loadRegistry({ force: true, fetchImpl: routes({ 'api/models-dev': big }), now: t0 + 10 })
    expect(d.fetchedAt).toBe(t0 + 10)
  })
  it('throws when nothing is available and there is no cache', async () => { await expect(loadRegistry({ fetchImpl: routes({}) })).rejects.toThrow() })
  it('merge keeps providers that only exist in the base and prefers richer model lists', () => {
    const base = normalizeModelsDev(RAW)
    const overlay = { ...base, providers: [{ ...base.providers.find((p) => p.id === 'openai')!, models: [{ id: 'gpt-5', name: 'GPT-5' }] }] }
    const m = mergeRegistries(base, overlay)
    expect(m.providers.some((p) => p.id === 'anthropic')).toBe(true)
    expect(m.providers.find((p) => p.id === 'openai')!.models.map((x) => x.id).sort()).toEqual(['gpt-4o', 'gpt-5'])
  })
})

describe('edge function /api/models-dev', () => {
  it('normalizes upstream, sets cache + CORS headers', async () => {
    const up = (async () => new Response(JSON.stringify(RAW), { status: 200 })) as unknown as typeof fetch
    const res = await handleModelsDev(new Request('https://x.dev/api/models-dev'), up)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(isRegistry(await res.json())).toBe(true)
  })
  it('OPTIONS preflight, bad method and upstream failure', async () => {
    expect((await handleModelsDev(new Request('https://x.dev/api/models-dev', { method: 'OPTIONS' }))).status).toBe(204)
    expect((await handleModelsDev(new Request('https://x.dev/api/models-dev', { method: 'POST' }))).status).toBe(405)
    const bad = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch
    const r = await handleModelsDev(new Request('https://x.dev/api/models-dev'), bad)
    expect(r.status).toBe(502)
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})

describe('bundled snapshot', () => {
  it('has >30 providers and hundreds of models with honest tags', async () => {
    const { readFileSync } = await import('node:fs')
    const reg = JSON.parse(readFileSync('public/catalog-snapshot.json', 'utf8'))
    expect(isRegistry(reg)).toBe(true)
    expect(reg.providers.length).toBeGreaterThan(30)
    expect(countModels(reg)).toBeGreaterThan(300)
    expect(reg.providers.filter((p: { compat: string }) => p.compat === 'browser-ready').length).toBeGreaterThan(20)
    expect(reg.providers.find((p: { id: string }) => p.id === 'amazon-bedrock')?.compat).toBe('requires-proxy')
  })
})
