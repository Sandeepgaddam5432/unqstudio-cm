import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, gate, usePrefs } from './prefs'
import { getUserContext, userContextBlock } from '@/core/ai/userContext'
import { parseSkillFile } from '@/core/skills'

describe('account preferences', () => {
  beforeEach(() => { localStorage.clear(); usePrefs.setState({ ...DEFAULT_PREFS, skills: [] }) })

  it('defaults: queue on, sound off, all permissions allow', () => {
    const s = usePrefs.getState()
    expect([s.messageQueue, s.completeSound, s.suggestions, s.tips]).toEqual([true, false, true, true])
    expect(Object.values(s.permissions).every((v) => v === 'allow')).toBe(true)
  })
  it('permission gate honours Allow / Ask each time / Deny', () => {
    const ask: string[] = []
    expect(gate('publishing', 'Publish', () => true)).toBe(true)
    usePrefs.getState().setPerm('publishing', 'ask')
    expect(gate('publishing', 'Publish', (m) => { ask.push(m); return false })).toBe(false)
    expect(ask[0]).toContain('Publish')
    usePrefs.getState().setPerm('publishing', 'deny')
    expect(gate('publishing', 'Publish', () => true)).toBe(false)
    expect(gate('build', 'Heal', () => false)).toBe(true)
  })
  it('instructions, memory and enabled skills flow into the prompt context', () => {
    const st = usePrefs.getState()
    st.set({ instructions: 'Use TypeScript' }); st.addMemory('likes dark mode'); st.addMemory('  '); st.removeMemory(5)
    st.setSkills([{ id: 's1', name: 'Tests', content: 'Write vitest', enabled: true, createdAt: 1 }, { id: 's2', name: 'Off', content: 'nope', enabled: false, createdAt: 2 }])
    const b = userContextBlock(getUserContext())
    expect(b).toContain('Global Instructions'); expect(b).toContain('Use TypeScript')
    expect(b).toContain('- likes dark mode'); expect(b).toContain('#### Tests'); expect(b).not.toContain('nope')
    expect(userContextBlock({ instructions: '', memory: [], skills: [] })).toBe('')
  })
  it('parses skill uploads (markdown verbatim, JSON name/content, rejects bad input)', () => {
    expect(parseSkillFile('review.md', '# Review\nbe kind')).toMatchObject({ name: 'review', enabled: true })
    expect(parseSkillFile('x.json', JSON.stringify({ name: 'Lint', instructions: 'fix lint' }))).toMatchObject({ name: 'Lint', content: 'fix lint' })
    expect(parseSkillFile('x.json', '{bad')).toBeNull()
    expect(parseSkillFile('e.md', '   ')).toBeNull()
  })
})
