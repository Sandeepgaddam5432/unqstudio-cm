import { beforeEach, describe, expect, it } from 'vitest'
import type { ProjectMeta } from '@/core/vfs/types'
import { CHAT_FILTERS, filterChats, isUnread, loadSeen, markSeen, markUnseen } from './chatFilters'

const mk = (id: string, over: Partial<ProjectMeta> = {}): ProjectMeta => ({ id, name: `Project ${id}`, createdAt: 1, updatedAt: 1000, pinned: false, locks: [], historyPtr: 0, ...over })

describe('chat filters', () => {
  beforeEach(() => localStorage.clear())
  it('exposes All / Unread / Scheduled / Archived', () => { expect(CHAT_FILTERS.map((f) => f.label)).toEqual(['All', 'Unread', 'Scheduled', 'Archived']) })
  it('all hides archived; archived shows only archived', () => {
    const ps = [mk('a'), mk('b', { archived: true })]
    expect(filterChats(ps, 'all', '', {}).map((p) => p.id)).toEqual(['a'])
    expect(filterChats(ps, 'archived', '', {}).map((p) => p.id)).toEqual(['b'])
  })
  it('unread = changed after last seen; never-opened is not unread', () => {
    const ps = [mk('a', { updatedAt: 2000 }), mk('b', { updatedAt: 500 }), mk('c')]
    const seen = { a: 1500, b: 1500 }
    expect(filterChats(ps, 'unread', '', seen).map((p) => p.id)).toEqual(['a'])
    expect(isUnread(ps[2]!, seen)).toBe(false)
  })
  it('scheduled uses the provided id set; query narrows results', () => {
    const ps = [mk('a'), mk('b')]
    expect(filterChats(ps, 'scheduled', '', {}, new Set(['b'])).map((p) => p.id)).toEqual(['b'])
    expect(filterChats(ps, 'all', 'project b', {}).map((p) => p.id)).toEqual(['b'])
  })
  it('persists seen markers', () => {
    markSeen('x', 42); expect(loadSeen().x).toBe(42)
    markUnseen(mk('x', { updatedAt: 100 })); expect(loadSeen().x).toBe(99)
  })
})
