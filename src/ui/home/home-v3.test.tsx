import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '@/core/vfs/memoryAdapter'
import { createProject } from '@/core/vfs/projects'
import { MAX_THUMB_CHARS, capThumbnail, fallbackThumbnail, persistThumbnail, snapshotToThumbnail, type ThumbSnapshot } from '@/core/preview/thumbnail'
import { recentProjects, starredProjects } from '@/lib/projectFilters'
import { SHOWCASE_CATEGORIES, filterShowcase, showcaseItems } from '@/templates/showcase'
import { BUILTIN_TEMPLATES } from '@/templates'
import { swipeIntent } from '@/ui/primitives/sheetPhysics'
import type { ProjectMeta } from '@/core/vfs/types'

const snap = (n: number): ThumbSnapshot => ({ w: 1000, h: 600, bg: 'rgb(255, 255, 255)', boxes: Array.from({ length: n }, (_, i) => ({ x: i, y: i, w: 100, h: 30, bg: 'rgb(10, 20, 30)', color: 'rgb(0, 0, 0)', fs: 14, fw: '600', r: 6, t: `Heading number ${i} <b>` })) })
const meta = (id: string, over: Partial<ProjectMeta> = {}): ProjectMeta => ({ id, name: id, createdAt: 1, updatedAt: 1, pinned: false, locks: [], historyPtr: 0, ...over })

describe('project thumbnails', () => {
  it('turns a layout snapshot into a compact, escaped SVG data URL under the cap', () => {
    const url = snapshotToThumbnail(snap(120), 'Demo')
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(url.length).toBeLessThanOrEqual(MAX_THUMB_CHARS)
    const svg = atob(url.split(',')[1]!)
    expect(svg).toContain('&lt;b&gt;')
    expect(svg).not.toContain('<b>')
  })
  it('trims boxes to fit a tiny cap and falls back when nothing fits / nothing captured', () => {
    expect(snapshotToThumbnail(snap(140), 'x', 6000).length).toBeLessThanOrEqual(6000)
    expect(snapshotToThumbnail({ w: 10, h: 10, bg: '', boxes: [] }, 'Zed')).toBe(fallbackThumbnail('Zed'))
    expect(fallbackThumbnail('Zed')).not.toBe(fallbackThumbnail('Amy'))
  })
  it('rejects oversized or non-image URLs and rejects hostile colours', () => {
    expect(capThumbnail('data:image/png;base64,' + 'A'.repeat(MAX_THUMB_CHARS))).toBeUndefined()
    expect(capThumbnail('javascript:alert(1)')).toBeUndefined()
    expect(capThumbnail('data:text/html;base64,AAAA')).toBeUndefined()
    const evil = snapshotToThumbnail({ w: 10, h: 10, bg: '"/><script>', boxes: [{ x: 0, y: 0, w: 5, h: 5, bg: 'red" onload="x', color: 'blue', fs: 12, fw: '400', r: 0, t: '' }] }, 'n')
    expect(atob(evil.split(',')[1]!)).not.toContain('onload')
  })
  it('persists a capped thumbnail on the project record without bumping updatedAt', async () => {
    const a = new MemoryAdapter()
    const p = await createProject(a, { name: 'T', files: { '/index.html': { c: '<p/>', e: 'utf8' } } })
    expect(await persistThumbnail(a, p.id, fallbackThumbnail('T'))).toBe(true)
    const got = (await a.getProject(p.id))!
    expect(got.thumbnail).toBe(fallbackThumbnail('T'))
    expect(got.updatedAt).toBe(p.updatedAt)
    expect(await persistThumbnail(a, p.id, 'data:image/png;base64,' + 'A'.repeat(MAX_THUMB_CHARS))).toBe(false)
    expect(await persistThumbnail(a, 'missing', fallbackThumbnail('T'))).toBe(false)
  })
})

describe('sidebar filtering', () => {
  const ps = [meta('alpha', { updatedAt: 5, starred: true }), meta('beta', { updatedAt: 9 }), meta('gamma', { updatedAt: 7, starred: true, description: 'Budget tool' }), meta('delta', { updatedAt: 2 })]
  it('splits starred and recent (recent excludes starred) newest first', () => {
    expect(starredProjects(ps).map((p) => p.id)).toEqual(['gamma', 'alpha'])
    expect(recentProjects(ps).map((p) => p.id)).toEqual(['beta', 'delta'])
    expect(recentProjects(ps, '', 1).map((p) => p.id)).toEqual(['beta'])
  })
  it('searches names and descriptions', () => {
    expect(starredProjects(ps, 'budget').map((p) => p.id)).toEqual(['gamma'])
    expect(recentProjects(ps, 'DEL').map((p) => p.id)).toEqual(['delta'])
  })
  it('edge swipe opens/closes only for mostly-horizontal drags past the threshold', () => {
    expect(swipeIntent(80, 5)).toBe('open')
    expect(swipeIntent(-80, 5)).toBe('close')
    expect(swipeIntent(30, 0)).toBe('none')
    expect(swipeIntent(80, 90)).toBe('none')
  })
})

describe('templates showcase', () => {
  const items = showcaseItems(BUILTIN_TEMPLATES)
  it('exposes the 9 category pills and hides the blank starter', () => {
    expect([...SHOWCASE_CATEGORIES]).toEqual(['All', 'SaaS', 'Dashboard', 'E-Commerce', 'Portfolio', 'AI App', 'Productivity', 'Blog', 'Full-stack'])
    expect(items.some((i) => i.template.id === 'blank')).toBe(false)
    expect(items.length).toBe(BUILTIN_TEMPLATES.length - 1)
  })
  it('filters by category', () => {
    expect(filterShowcase(items, 'All').length).toBe(items.length)
    expect(filterShowcase(items, 'SaaS').map((i) => i.template.id)).toEqual(['saas'])
    expect(filterShowcase(items, 'E-Commerce').map((i) => i.template.id)).toEqual(['store'])
    expect(filterShowcase(items, 'AI App').map((i) => i.template.id)).toEqual(['aichat'])
    expect(filterShowcase(items, 'Blog')).toHaveLength(1)
  })
})
