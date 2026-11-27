import { describe, expect, it } from 'vitest'
import { buildActivity, tokenizeLine, type ActivityMsg } from './activity'

const op = (id: string, o: 'create' | 'update' | 'delete', path: string, status = 'applied') => ({ id, op: o, path, status, added: 3, removed: 1, before: o === 'create' ? undefined : 'a\n', after: 'b\n' }) as never

const msg: ActivityMsg = {
  id: 'm1', role: 'assistant', text: '', mode: 'build', durationMs: 75_000, usage: { inputTokens: 1000, outputTokens: 234 },
  parts: [{ kind: 'think', text: 'plan it' }, { kind: 'op', opId: 'o1' }, { kind: 'text', text: 'done' }, { kind: 'op', opId: 'o2' }],
  ops: [op('o1', 'create', '/src/A.tsx'), op('o2', 'update', '/src/App.tsx'), op('o3', 'update', '/src/x.ts', 'failed')],
}

describe('buildActivity', () => {
  it('orders the timeline chronologically with thought → ops → build', () => {
    const a = buildActivity(msg, { buildStatus: 'ready', agentLabels: ['Read /src/main.tsx'] })
    expect(a.timeline.map((t) => t.kind)).toEqual(['read', 'thought', 'created', 'edited', 'edited', 'build'])
    expect(a.timeline[1]!.label).toMatch(/^Thought for/)
    expect(a.timeline.find((t) => t.id === 'o3')!.state).toBe('error')
  })
  it('lists only applied ops as changes with Created/Modified verbs', () => {
    const a = buildActivity(msg)
    expect(a.changes.map((c) => c.verb)).toEqual(['Created', 'Modified'])
    expect(a.changes[0]).toMatchObject({ path: '/src/A.tsx', added: 3, removed: 1 })
  })
  it('summarises duration, steps and tokens; counts tools without thoughts', () => {
    const a = buildActivity(msg)
    expect(a.summary).toMatch(/^Worked for .* · \d+ steps · 1,234 tokens$/)
    expect(a.toolCount).toBe(a.timeline.length - 1)
  })
  it('adds a Questions answered card in ask mode', () => {
    const a = buildActivity({ id: 'q', role: 'assistant', text: 'x', mode: 'ask' }, { prevUserText: 'why?' })
    expect(a.timeline[0]).toMatchObject({ kind: 'question', label: 'Questions answered', detail: 'why?' })
  })
  it('tokenizes keywords, strings, comments and numbers', () => {
    const t = tokenizeLine("const a = 'x' // hi 42")
    expect(t.map((x) => x.t)).toEqual(['k', 'p', 's', 'p', 'c'])
    expect(tokenizeLine('n = 42').some((x) => x.t === 'n')).toBe(true)
  })
})
