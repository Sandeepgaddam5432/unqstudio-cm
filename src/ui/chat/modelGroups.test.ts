import { describe, expect, it } from 'vitest'
import { GROUP_CAP, groupModels, primaryTag } from './modelGroups'
import type { EnrichedModel } from '@/core/ai/modelFetcher'

const M = (id: string, o: Partial<EnrichedModel> = {}): EnrichedModel => ({ id, name: id, source: 'catalog', ...o })
const P = (id: string, o: object = {}) => ({ id, ...o })

describe('model groups', () => {
  it('assigns each model to one purpose group and caps groups', () => {
    const e = [
      { p: P('anthropic'), m: M('claude-sonnet-4-5') }, { p: P('openai'), m: M('o3', { reasoning: true }) }, { p: P('google'), m: M('gemini-2.5-flash', { vision: true }) },
      { p: P('ollama', { compat: 'local' }), m: M('llama3') }, { p: P('x'), m: M('qwen-coder') }, { p: P('y'), m: M('pixtral', { vision: true }) },
    ]
    const g = groupModels(e)
    expect(g.recommended.map((x) => x.m.id)).toContain('claude-sonnet-4-5')
    expect(g.local.map((x) => x.m.id)).toEqual(['llama3'])
    expect(g.coding.map((x) => x.m.id)).toContain('qwen-coder')
    expect(g.reasoning.map((x) => x.m.id)).toContain('o3')
    expect(g.vision.map((x) => x.m.id)).toContain('gemini-2.5-flash')
    const all = Object.values(g).flat().map((x) => x.m.id)
    expect(new Set(all).size).toBe(all.length)
    for (const k of Object.values(g)) expect(k.length).toBeLessThanOrEqual(GROUP_CAP)
  })
  it('shows exactly one subtle tag', () => {
    expect(primaryTag(M('a:free'))).toBe('Free')
    expect(primaryTag(M('x', { reasoning: true }))).toBe('Reasoning')
    expect(primaryTag(M('plain-model'))).toBeNull()
  })
})
