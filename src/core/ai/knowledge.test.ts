import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '@/core/vfs/memoryAdapter'
import { createProject } from '@/core/vfs/projects'
import { VirtualFileSystem } from '@/core/vfs/vfs'
import { buildProjectContext, KNOWLEDGE_MAX } from './prompts'
import { KNOWLEDGE_SNIPPETS, addSnippet, versionRows } from '@/ui/project/ProjectSettings'
import type { CheckpointMeta } from '@/core/vfs/types'

async function open() {
  const a = new MemoryAdapter()
  const meta = await createProject(a, { name: 'Acme', files: { '/index.html': { c: '<div id="root"></div>', e: 'utf8' }, '/src/App.tsx': { c: 'export default function App(){return null}', e: 'utf8' } } })
  return VirtualFileSystem.open(a, meta.id)
}

describe('Project Knowledge injection', () => {
  it('is absent when unset and injected right after the project header when set', async () => {
    const vfs = await open()
    expect(buildProjectContext(vfs).text).not.toContain('Project Knowledge')
    vfs.meta.knowledge = '## Brand\nPrimary #6D5EF5. Friendly tone.'
    const t = buildProjectContext(vfs).text
    expect(t).toContain('### Project Knowledge')
    expect(t).toContain('Primary #6D5EF5')
    expect(t.indexOf('## Project: Acme')).toBeLessThan(t.indexOf('### Project Knowledge'))
    expect(t.indexOf('### Project Knowledge')).toBeLessThan(t.indexOf('### File tree'))
  })
  it('caps injected knowledge and ignores whitespace-only text', async () => {
    const vfs = await open()
    vfs.meta.knowledge = 'k'.repeat(KNOWLEDGE_MAX + 5000)
    const t = buildProjectContext(vfs).text
    expect(t.match(/k+/g)!.sort((x, y) => y.length - x.length)[0]!.length).toBe(KNOWLEDGE_MAX)
    vfs.meta.knowledge = '   \n '
    expect(buildProjectContext(vfs).text).not.toContain('Project Knowledge')
  })
  it('starter snippets append once and respect the cap', () => {
    const s = KNOWLEDGE_SNIPPETS[0]!.text
    const once = addSnippet('', s)
    expect(addSnippet(once, s)).toBe(once)
    expect(addSnippet('# Mine', s).startsWith('# Mine\n\n## Mobile-first')).toBe(true)
    expect(addSnippet('z'.repeat(KNOWLEDGE_MAX), s).length).toBe(KNOWLEDGE_MAX)
    expect(KNOWLEDGE_SNIPPETS.map((x) => x.label)).toEqual(['Mobile-First Polish', 'Strict TypeScript', 'Brand Style Guide'])
  })
})

describe('version history rows', () => {
  const cp = (id: string, seq: number, kind: CheckpointMeta['kind']): CheckpointMeta => ({ id, projectId: 'p', label: id, kind, createdAt: seq, fileCount: 1, bytes: 1, seq, hash: id })
  const cps = [cp('c0', 0, 'auto'), cp('c1', 1, 'ai'), cp('c2', 2, 'restore'), cp('c3', 3, 'manual'), cp('c4', 4, 'ai')]
  it('numbers ai/manual checkpoints oldest→newest and lists newest first', () => {
    expect(versionRows(cps).map((r) => [r.cp.id, r.n])).toEqual([['c4', 3], ['c3', 2], ['c1', 1]])
  })
  it('filters to bookmarked versions only', () => {
    expect(versionRows(cps, ['c3'], true).map((r) => r.cp.id)).toEqual(['c3'])
    expect(versionRows(cps, ['c1'], false).find((r) => r.cp.id === 'c1')!.starred).toBe(true)
  })
})
