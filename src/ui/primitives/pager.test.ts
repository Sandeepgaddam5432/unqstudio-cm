import { describe, expect, it } from 'vitest'
import { edgeResist, settleIndex, swipeAxis } from './pagerPhysics'
import { canonicalModelKey, dedupeModels } from '@/ui/chat/modelGroups'
import { paneIndex } from '@/ui/layout/MobileShell'

describe('swipe pager physics', () => {
  it('locks horizontal only with clear dominance past the slop', () => {
    expect(swipeAxis(4, 3)).toBe('idle')
    expect(swipeAxis(20, 4)).toBe('h')
    expect(swipeAxis(12, 14)).toBe('v')
    expect(swipeAxis(2, 30)).toBe('v')
  })
  it('rubber-bands past the first / last pane', () => {
    expect(edgeResist(100, 0, 3)).toBeCloseTo(28)
    expect(edgeResist(-100, 2, 3)).toBeCloseTo(-28)
    expect(edgeResist(100, 1, 3)).toBe(100)
  })
  it('settles by distance or velocity and clamps', () => {
    expect(settleIndex(0, -120, 0, 390, 3)).toBe(1)
    expect(settleIndex(1, 130, 0, 390, 3)).toBe(0)
    expect(settleIndex(1, -20, -0.6, 390, 3)).toBe(2)
    expect(settleIndex(1, -20, 0, 390, 3)).toBe(1)
    expect(settleIndex(0, 300, 1, 390, 3)).toBe(0)
    expect(settleIndex(2, -300, -1, 390, 3)).toBe(2)
    expect(paneIndex(390, 390)).toBe(1)
  })
})

describe('model catalog de-duplication', () => {
  it('canonicalises provider prefixes and date / latest suffixes', () => {
    expect(canonicalModelKey({ id: 'anthropic/claude-sonnet-4-5-20250929' })).toBe('claude-sonnet-4-5')
    expect(canonicalModelKey({ id: 'claude-sonnet-4-5-latest' })).toBe('claude-sonnet-4-5')
    expect(canonicalModelKey({ id: 'gpt-4o-2024-08-06' })).toBe('gpt-4o')
  })
  it('keeps one row per model (the alias) and always keeps the selected id', () => {
    const list = [{ id: 'claude-sonnet-4-5-20250929' }, { id: 'claude-sonnet-4-5' }, { id: 'claude-opus-4' }, { id: 'claude-sonnet-4-5' }]
    expect(dedupeModels(list).map((m) => m.id)).toEqual(['claude-sonnet-4-5', 'claude-opus-4'])
    expect(dedupeModels(list, 'claude-sonnet-4-5-20250929').map((m) => m.id)).toContain('claude-sonnet-4-5-20250929')
  })
})
