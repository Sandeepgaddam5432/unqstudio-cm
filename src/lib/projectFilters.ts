import type { ProjectMeta } from '@/core/vfs/types'

/** Pure filtering used by the sidebar and Home grid. */
export function matchesProject(p: ProjectMeta, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)
}

export function starredProjects(ps: ProjectMeta[], query = ''): ProjectMeta[] {
  return ps.filter((p) => p.starred && matchesProject(p, query)).sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Most recently edited projects that are not starred (starred ones have their own section). */
export function recentProjects(ps: ProjectMeta[], query = '', limit = 8): ProjectMeta[] {
  return ps.filter((p) => !p.starred && matchesProject(p, query)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
}
