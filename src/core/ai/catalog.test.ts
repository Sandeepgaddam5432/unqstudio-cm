import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import 'fake-indexeddb/auto'
import { dedupeModels, enrichRegistry, fetchEnrichment, matchKey, normalizeLiteLLM, normalizeOpenRouter } from './catalogEnricher'
import { fetchRegistry } from './modelsRegistry'
import type { Registry, RegProvider } from './modelsDev'

// Fixtures mirror the REAL live payload shapes (verified against the live endpoints during the v2.1 audit).
const OR_RAW = { data: [
  { id: 'upstage/solar-mini-4-5', name: 'Upstage: Solar Mini 4.5', created: 1795562304, context_length: 524288,
    architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    pricing: { prompt: '0.00000001', completion: '0.00000004' }, top_provider: { context_length: 524288, max_completion_tokens: 131072 },
    supported_parameters: ['reasoning', 'tools', 'max_tokens'] },
  { id: 'openai/gpt-4o', name: 'OpenAI: GPT-4o', context_length: 128000, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
    pricing: { prompt: '0.0000025', completion: '0.00001' }, top_provider: { max_completion_tokens: 16384 }, supported_parameters: ['tools'] },
  { id: 'some/free-model:free', name: 'Free', context_length: 8000, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '0', completion: '0' }, supported_parameters: [] },
  { id: 'img/gen', name: 'Image only', architecture: { input_modalities: ['text'], output_modalities: ['image'] }, pricing: {} },
  { name: 'no id' },
] }
const LL_RAW = {
  sample_spec: { mode: 'one of: chat, embedding' },
  'gpt-4o': { litellm_provider: 'openai', mode: 'chat', max_input_tokens: 128000, max_output_tokens: 16384, input_cost_per_token: 0.0000025, output_cost_per_token: 0.00001, supports_vision: true, supports_function_calling: true },
  'openai/gpt-4o': { litellm_provider: 'openai', mode: 'chat', max_input_tokens: 128000 },
  'claude-sonnet-4-5': { litellm_provider: 'anthropic', mode: 'chat', max_input_tokens: 200000, max_output_tokens: 64000, input_cost_per_token: 0.000003, output_cost_per_token: 0.000015, supports_reasoning: true },
  'text-embedding-3-small': { litellm_provider: 'openai', mode: 'embedding', max_input_tokens: 8191 },
  'dall-e-3': { litellm_provider: 'openai', mode: 'image_generation' },
}

const prov = (id: string, models: RegProvider['models'], extra: Partial<RegProvider> = {}): RegProvider => ({ id, name: id, logo: '', kind: 'openai', compat: 'browser-ready', models, ...extra })
const baseReg = (): Registry => ({ version: 1, generatedAt: 't', source: 'x', providers: [
  prov('openai', [{ id: 'gpt-4o', name: 'GPT-4o', context: 111 }]),
  prov('anthropic', [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }], { kind: 'anthropic' }),
  prov('openrouter', [{ id: 'openai/gpt-4o', name: 'GPT-4o (OR)' }]),
] })

describe('normalizeOpenRouter (real payload shape)', () => {
  const out = normalizeOpenRouter(OR_RAW)
  it('converts per-token prices to USD/1M and reads capabilities', () => {
    const m = out.find((x) => x.id === 'upstage/solar-mini-4-5')!
    expect(m).toMatchObject({ context: 524288, output: 131072, reasoning: true, tool_call: true, release_date: '2026-11-24' })
    expect(m.cost).toEqual({ input: 0.01, output: 0.04 })
    expect(out.find((x) => x.id === 'openai/gpt-4o')).toMatchObject({ vision: true, cost: { input: 2.5, output: 10 } })
  })
  it('keeps free models (cost 0), skips image-only generators and id-less rows', () => {
    expect(out.find((x) => x.id === 'some/free-model:free')?.cost).toEqual({ input: 0, output: 0 })
    expect(out.some((x) => x.id === 'img/gen')).toBe(false)
    expect(out).toHaveLength(3)
  })
  it('tolerates garbage', () => { expect(normalizeOpenRouter(null)).toEqual([]); expect(normalizeOpenRouter({ data: 'x' })).toEqual([]) })
})

describe('normalizeLiteLLM (real payload shape)', () => {
  const out = normalizeLiteLLM(LL_RAW)
  it('keeps chat-capable rows only and converts pricing', () => {
    expect(out.map((x) => x.id).sort()).toEqual(['claude-sonnet-4-5', 'gpt-4o', 'openai/gpt-4o'])
    expect(out.find((x) => x.id === 'claude-sonnet-4-5')).toMatchObject({ context: 200000, output: 64000, reasoning: true, cost: { input: 3, output: 15 } })
  })
  it('tolerates garbage', () => { expect(normalizeLiteLLM([])).toEqual([]); expect(normalizeLiteLLM(null)).toEqual([]) })
})

describe('matchKey', () => {
  it('unifies vendor prefixes, dots and suffixes', () => {
    expect(matchKey('anthropic/claude-sonnet-4.5')).toBe(matchKey('claude-sonnet-4-5'))
    expect(matchKey('meta-llama/llama-3.3-70b-instruct:free')).toBe('llama-3-3-70b-instruct')
  })
})

describe('enrichRegistry — multi-source merge', () => {
  const merged = enrichRegistry(baseReg(), { openrouter: normalizeOpenRouter(OR_RAW), litellm: normalizeLiteLLM(LL_RAW) })
  const byId = (p: string, m: string) => merged.providers.find((x) => x.id === p)!.models.find((x) => x.id === m)!
  it('never overrides higher-priority directory data', () => { expect(byId('openai', 'gpt-4o').context).toBe(111) })
  it('fills missing pricing / output / capabilities from OpenRouter then LiteLLM', () => {
    expect(byId('openai', 'gpt-4o')).toMatchObject({ output: 16384, vision: true, tool_call: true, cost: { input: 2.5, output: 10 } })
    expect(byId('anthropic', 'claude-sonnet-4-5')).toMatchObject({ context: 200000, reasoning: true, cost: { input: 3, output: 15 } })
  })
  it('adds same-day OpenRouter launches to the openrouter provider only', () => {
    expect(byId('openrouter', 'upstage/solar-mini-4-5')).toMatchObject({ context: 524288, name: 'Upstage: Solar Mini 4.5' })
    expect(merged.providers.find((p) => p.id === 'openai')!.models.some((m) => m.id.startsWith('upstage'))).toBe(false)
  })
  it('records which sources were merged and does not mutate the input', () => {
    expect(merged.enriched).toEqual({ openrouter: true, litellm: true })
    const b = baseReg(); enrichRegistry(b, { litellm: normalizeLiteLLM(LL_RAW) })
    expect(b.providers[0]!.models[0]).toEqual({ id: 'gpt-4o', name: 'GPT-4o', context: 111 })
  })
  it('works with only one source, or none', () => {
    expect(enrichRegistry(baseReg(), { litellm: normalizeLiteLLM(LL_RAW) }).enriched).toEqual({ openrouter: false, litellm: true })
    expect(enrichRegistry(baseReg(), {}).providers).toHaveLength(3)
  })
  it('dedupes case-insensitively, first wins', () => {
    expect(dedupeModels([{ id: 'A', name: '1' }, { id: 'a', name: '2' }, { id: 'b', name: '3' }]).map((m) => m.name)).toEqual(['1', '3'])
  })
})

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
const bigDir = (): Registry => ({ version: 1, generatedAt: 't', source: 'snap', providers: Array.from({ length: 12 }, (_, i) => prov(i === 0 ? 'openrouter' : `p${i}`, [{ id: `m${i}`, name: `M${i}` }])) })
const route = (m: Record<string, Response | 'fail' | 'hang'>): typeof fetch => (async (url: string, init?: RequestInit) => {
  const key = Object.keys(m).find((k) => String(url).includes(k))
  const v = key ? m[key] : undefined
  if (v === 'hang') return new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))
  if (!v || v === 'fail') throw new TypeError('network')
  return v.clone()
}) as typeof fetch

describe('fetchRegistry — fallback resilience', () => {
  it('merges OpenRouter + LiteLLM into the bundled snapshot', async () => {
    const r = await fetchRegistry(route({ 'catalog-snapshot.json': json(bigDir()), 'openrouter.ai': json(OR_RAW), 'litellm': json(LL_RAW) }))
    expect(r.source).toBe('bundled')
    expect(r.data.enriched).toEqual({ openrouter: true, litellm: true })
    expect(r.data.providers.find((p) => p.id === 'openrouter')!.models.some((m) => m.id === 'upstage/solar-mini-4-5')).toBe(true)
  })
  it('survives OpenRouter failing (LiteLLM still enriches)', async () => {
    const r = await fetchRegistry(route({ 'catalog-snapshot.json': json(bigDir()), 'openrouter.ai': 'fail', 'litellm': json(LL_RAW) }))
    expect(r.data.enriched).toEqual({ openrouter: false, litellm: true })
  })
  it('survives both enrichers failing → plain snapshot', async () => {
    const r = await fetchRegistry(route({ 'catalog-snapshot.json': json(bigDir()) }))
    expect(r.source).toBe('bundled')
    expect(r.data.providers).toHaveLength(12)
  })
  it('times out a hanging source without blocking the others', async () => {
    const r = await fetchRegistry(route({ 'catalog-snapshot.json': json(bigDir()), 'openrouter.ai': 'hang', 'litellm': json(LL_RAW) }), { timeoutMs: 30 })
    expect(r.data.enriched?.litellm).toBe(true)
    expect(r.data.enriched?.openrouter).toBeFalsy()
  })
  it('skips client enrichment when the edge already merged every source', async () => {
    let calls = 0
    const edge = { ...bigDir(), enriched: { openrouter: true, litellm: true } }
    const f = (async (u: string) => { calls++; if (String(u).includes('api/catalog')) return json(edge); throw new TypeError('x') }) as typeof fetch
    const r = await fetchRegistry(f)
    expect(r.source).toBe('edge'); expect(calls).toBe(1)
  })
  it('fetchEnrichment reports partial success', async () => {
    const e = await fetchEnrichment(route({ 'openrouter.ai': json(OR_RAW) }))
    expect(e.openrouter).toHaveLength(3); expect(e.litellm).toBeUndefined()
  })
})

describe('zero-leak branding (user-facing surfaces)', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p] })
  const ui = walk('src/ui').filter((f) => /\.(tsx?|css)$/.test(f))
  it.each([...ui, 'index.html', 'public/llms.txt', 'public/llms-full.txt', 'public/manifest.webmanifest'])('%s never mentions the upstream directory brand', (f) => {
    expect(readFileSync(f, 'utf8')).not.toMatch(/models\.dev/i)
  })
})
