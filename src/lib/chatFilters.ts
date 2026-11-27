import type { ProjectMeta } from '@/core/vfs/types'
import { matchesProject } from './projectFilters'

export type ChatFilter = 'all' | 'unread' | 'scheduled' | 'archived'
export const CHAT_FILTERS: { id: ChatFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'unread', label: 'Unread' }, { id: 'scheduled', label: 'Scheduled' }, { id: 'archived', label: 'Archived' },
]
export type SeenMap = Record<string, number>
const KEY = 'unq.chats.seen'

export function loadSeen(): SeenMap {
  try { const o = JSON.parse(localStorage.getItem(KEY) ?? '{}') as SeenMap; return o && typeof o === 'object' ? o : {} } catch { return {} }
}
function save(m: SeenMap) { try { localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* private mode */ } }
export function markSeen(id: string, at = Date.now()) { const m = loadSeen(); m[id] = at; save(m) }
export function markUnseen(p: ProjectMeta) { const m = loadSeen(); m[p.id] = p.updatedAt - 1; save(m) }
export function isUnread(p: ProjectMeta, seen: SeenMap): boolean { const s = seen[p.id]; return s !== undefined && p.updatedAt > s }

/** Pure chat-list filter. A project's conversation is unread when it changed after it was last opened; scheduled chats are those whose id is in `scheduled`. */
export function filterChats(ps: ProjectMeta[], filter: ChatFilter, query: string, seen: SeenMap, scheduled: ReadonlySet<string> = new Set()): ProjectMeta[] {
  return ps.filter((p) => {
    if (!matchesProject(p, query)) return false
    if (filter === 'archived') return !!p.archived
    if (p.archived) return false
    if (filter === 'unread') return isUnread(p, seen)
    if (filter === 'scheduled') return scheduled.has(p.id)
    return true
  })
}
