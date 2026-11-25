// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryAdapter } from './memoryAdapter'
import { IdbAdapter } from './idbAdapter'
import { VirtualFileSystem, FileLockedError, normalizePath, diffSnapshots } from './vfs'
import { createProject, duplicateProject, forkFromCheckpoint } from './projects'
import { exportZip, importZip } from './zip'
import { pack, unpack } from './compress'
import { scaffoldFiles } from './scaffold'
import { countLineChanges } from './lineDiff'

async function setup(files: Record<string, string> = { '/src/App.tsx': 'export default 1', '/src/lib/a.ts': 'export const a = 1', '/index.html': '<div id="root"></div>' }) {
  const adapter = new MemoryAdapter()
  const meta = await createProject(adapter, { name: 'T', files })
  const vfs = await VirtualFileSystem.open(adapter, meta.id)
  return { adapter, vfs, meta }
}

describe('normalizePath', () => {
  it('normalizes', () => {
    expect(normalizePath('src//a/./b/../c.ts')).toBe('/src/a/c.ts')
    expect(normalizePath('\\x\\y')).toBe('/x/y')
  })
})

describe('VFS CRUD', () => {
  let ctx: Awaited<ReturnType<typeof setup>>
  beforeEach(async () => { ctx = await setup() })

  it('reads, writes and persists', async () => {
    const { vfs, adapter } = ctx
    await vfs.write('src/new.ts', 'x')
    expect(vfs.read('/src/new.ts')).toBe('x')
    const reopened = await VirtualFileSystem.open(adapter, vfs.projectId)
    expect(reopened.read('/src/new.ts')).toBe('x')
  })
  it('emits change events', async () => {
    let n = 0
    ctx.vfs.subscribe(() => n++)
    await ctx.vfs.write('/a.txt', '1')
    expect(n).toBe(1)
  })
  it('renames files and folders', async () => {
    const { vfs } = ctx
    await vfs.rename('/src/lib', '/src/utils')
    expect(vfs.has('/src/utils/a.ts')).toBe(true)
    expect(vfs.has('/src/lib/a.ts')).toBe(false)
    await vfs.rename('/src/App.tsx', '/src/Main.tsx')
    expect(vfs.read('/src/Main.tsx')).toBe('export default 1')
    await expect(vfs.rename('/src/Main.tsx', '/src/utils/a.ts')).rejects.toThrow(/exists/)
  })
  it('moves, duplicates, removes and mkdir', async () => {
    const { vfs } = ctx
    await vfs.move('/src/App.tsx', '/src/lib')
    expect(vfs.has('/src/lib/App.tsx')).toBe(true)
    const dup = await vfs.duplicate('/src/lib/a.ts')
    expect(dup).toBe('/src/lib/a copy.ts')
    expect(vfs.read(dup)).toBe('export const a = 1')
    const dup2 = await vfs.duplicate('/src/lib/a.ts')
    expect(dup2).toBe('/src/lib/a copy 2.ts')
    await vfs.mkdir('/empty')
    expect(vfs.isFolder('/empty')).toBe(true)
    expect(await vfs.remove('/src/lib')).toBeGreaterThan(1)
    expect(vfs.isFolder('/src/lib')).toBe(false)
  })
  it('searches and replaces across files', async () => {
    const { vfs } = ctx
    await vfs.write('/src/b.ts', 'const Foo = 1\nconst foo = 2\nFOO()')
    expect(vfs.search('foo').length).toBe(3)
    expect(vfs.search('foo', { caseSensitive: true }).length).toBe(1)
    expect(vfs.search('Foo|foo', { regex: true, wholeWord: true }).length).toBe(3)
    const r = await vfs.replaceAll('foo', 'bar')
    expect(r.replacements).toBe(3)
    expect(vfs.read('/src/b.ts')).toBe('const bar = 1\nconst bar = 2\nbar()')
  })
})

describe('file locking', () => {
  it('blocks AI writes/deletes/renames on locked files but not user edits', async () => {
    const { vfs } = await setup()
    await vfs.lock('/src/App.tsx')
    await expect(vfs.write('/src/App.tsx', 'hacked', { actor: 'ai' })).rejects.toBeInstanceOf(FileLockedError)
    await expect(vfs.remove('/src/App.tsx', { actor: 'ai' })).rejects.toBeInstanceOf(FileLockedError)
    await expect(vfs.rename('/src/App.tsx', '/src/B.tsx', { actor: 'ai' })).rejects.toBeInstanceOf(FileLockedError)
    expect(vfs.read('/src/App.tsx')).toBe('export default 1')
    await vfs.write('/src/App.tsx', 'user edit', { actor: 'user' })
    expect(vfs.read('/src/App.tsx')).toBe('user edit')
    await vfs.unlock('/src/App.tsx')
    await vfs.write('/src/App.tsx', 'ai edit', { actor: 'ai' })
    expect(vfs.read('/src/App.tsx')).toBe('ai edit')
  })
  it('folder locks cover nested files, follow renames and skip replaceAll', async () => {
    const { vfs } = await setup()
    await vfs.lock('/src/lib')
    expect(vfs.isLocked('/src/lib/a.ts')).toBe(true)
    expect(vfs.lockedBy('/src/lib/a.ts')).toBe('/src/lib')
    await expect(vfs.write('/src/lib/new.ts', 'x', { actor: 'ai' })).rejects.toThrow(/locked/)
    const r = await vfs.replaceAll('export', 'EXPORT')
    expect(r.skippedLocked).toContain('/src/lib/a.ts')
    expect(vfs.read('/src/lib/a.ts')).toBe('export const a = 1')
    await vfs.rename('/src/lib', '/src/core')
    expect(vfs.getLocks()).toEqual(['/src/core'])
  })
  it('persists locks', async () => {
    const { vfs, adapter } = await setup()
    await vfs.lock('/index.html')
    const again = await VirtualFileSystem.open(adapter, vfs.projectId)
    expect(again.isLocked('/index.html')).toBe(true)
  })
})

describe('checkpoints', () => {
  it('restores, undoes and redoes without losing manual edits', async () => {
    const { vfs } = await setup()
    const initial = vfs.listCheckpoints()[0]
    await vfs.write('/src/App.tsx', 'v2')
    const cp2 = await vfs.checkpoint('v2', 'manual')
    await vfs.write('/src/App.tsx', 'v3-unsaved')
    expect(vfs.isDirty()).toBe(true)
    await vfs.restore(initial.id)
    expect(vfs.read('/src/App.tsx')).toBe('export default 1')
    // unsaved edit is preserved in an automatic checkpoint
    const labels = vfs.listCheckpoints().map((c) => c.label)
    expect(labels).toContain('Before restore')
    const saved = vfs.listCheckpoints().find((c) => c.label === 'Before restore')!
    expect((await vfs.getCheckpointSnapshot(saved.id))['/src/App.tsx'].c).toBe('v3-unsaved')
    await vfs.restore(cp2.id)
    expect(vfs.read('/src/App.tsx')).toBe('v2')
  })
  it('undo / redo move along the timeline', async () => {
    const { vfs } = await setup()
    await vfs.write('/src/App.tsx', 'A')
    await vfs.checkpoint('A', 'ai')
    await vfs.write('/src/App.tsx', 'B')
    await vfs.checkpoint('B', 'ai')
    expect(vfs.canUndo()).toBe(true)
    expect(vfs.canRedo()).toBe(false)
    await vfs.undo()
    expect(vfs.read('/src/App.tsx')).toBe('A')
    await vfs.undo()
    expect(vfs.read('/src/App.tsx')).toBe('export default 1')
    expect(vfs.canUndo()).toBe(false)
    await vfs.redo()
    await vfs.redo()
    expect(vfs.read('/src/App.tsx')).toBe('B')
    expect(vfs.canRedo()).toBe(false)
  })
  it('undo after unsaved edits checkpoints them first', async () => {
    const { vfs } = await setup()
    await vfs.write('/src/App.tsx', 'dirty')
    expect(await vfs.undo()).toBe(true)
    expect(vfs.read('/src/App.tsx')).toBe('export default 1')
    await vfs.redo()
    expect(vfs.read('/src/App.tsx')).toBe('dirty')
  })
  it('restores deleted + added files and diffs against a checkpoint', async () => {
    const { vfs } = await setup()
    const base = vfs.listCheckpoints()[0]
    await vfs.remove('/src/lib/a.ts')
    await vfs.write('/src/new.ts', 'n')
    await vfs.write('/src/App.tsx', 'changed')
    const diffs = await vfs.diffAgainstCheckpoint(base.id)
    expect(diffs.map((d) => [d.path, d.status]).sort()).toEqual([['/src/App.tsx', 'modified'], ['/src/lib/a.ts', 'removed'], ['/src/new.ts', 'added']])
    await vfs.restore(base.id)
    expect(vfs.has('/src/lib/a.ts')).toBe(true)
    expect(vfs.has('/src/new.ts')).toBe(false)
  })
  it('forks a new project from a checkpoint', async () => {
    const { vfs, adapter } = await setup()
    const base = vfs.listCheckpoints()[0]
    await vfs.write('/src/App.tsx', 'later')
    await vfs.lock('/index.html')
    const fork = await forkFromCheckpoint(adapter, vfs, base.id, 'Forked')
    const fv = await VirtualFileSystem.open(adapter, fork.id)
    expect(fv.read('/src/App.tsx')).toBe('export default 1')
    expect(fv.meta.forkOf?.projectId).toBe(vfs.projectId)
    expect(fv.isLocked('/index.html')).toBe(true)
  })
  it('auto checkpoints are de-duplicated and snapshots round-trip compression', async () => {
    const { vfs } = await setup()
    const n = vfs.listCheckpoints().length
    await vfs.checkpoint('same', 'auto')
    expect(vfs.listCheckpoints().length).toBe(n)
    const snap = vfs.snapshot()
    expect(await unpack(await pack(snap))).toEqual(snap)
  })
})

describe('IndexedDB adapter', () => {
  it('persists projects, files, checkpoints and kv; deletes cascade', async () => {
    const adapter = new IdbAdapter('test-db-' + Math.random())
    const meta = await createProject(adapter, { name: 'Idb', files: { '/a.txt': 'hello' } })
    const vfs = await VirtualFileSystem.open(adapter, meta.id)
    await vfs.write('/b.txt', 'world')
    await vfs.checkpoint('cp', 'manual')
    await adapter.kvSet('chat:1', { x: 1 })
    expect((await adapter.kvList('chat:')).length).toBe(1)
    const again = await VirtualFileSystem.open(adapter, meta.id)
    expect(again.paths()).toEqual(['/a.txt', '/b.txt'])
    expect(again.listCheckpoints().length).toBe(2)
    expect((await adapter.stats()).files).toBe(2)
    const dup = await duplicateProject(adapter, meta.id)
    expect((await adapter.listProjects()).length).toBe(2)
    await adapter.deleteProject(meta.id)
    expect((await adapter.listFiles(meta.id)).length).toBe(0)
    expect((await adapter.listCheckpoints(meta.id)).length).toBe(0)
    expect((await adapter.listFiles(dup.id)).length).toBe(2)
  })
})

describe('ZIP codec', () => {
  it('exports a runnable project and imports it back (round trip)', async () => {
    const files = { ...scaffoldFiles('Zip Test'), '/src/App.tsx': 'export default function App(){return null}' }
    const { vfs } = await setup(files)
    await vfs.write('/public/pixel.png', 'iVBORw0KGgo=', { encoding: 'base64' })
    const blob = await exportZip(vfs.snapshot(), 'Zip Test')
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const names = Object.keys(zip.files)
    for (const n of ['zip-test/package.json', 'zip-test/vite.config.ts', 'zip-test/index.html', 'zip-test/src/App.tsx']) expect(names).toContain(n)
    expect(JSON.parse(await zip.file('zip-test/package.json')!.async('string')).dependencies.react).toBeTruthy()
    const back = await importZip(await blob.arrayBuffer())
    expect(back.name).toBe('zip-test')
    expect(back.files['/src/App.tsx'].c).toContain('function App')
    expect(back.files['/public/pixel.png']).toEqual({ c: 'iVBORw0KGgo=', e: 'base64' })
  })
  it('adds scaffolding to partial projects and ignores node_modules', async () => {
    const JSZip = (await import('jszip')).default
    const z = new JSZip()
    z.file('proj/src/App.tsx', 'x')
    z.file('proj/node_modules/a/index.js', 'x')
    z.file('proj/.git/config', 'x')
    const imported = await importZip(await z.generateAsync({ type: 'arraybuffer' }))
    expect(Object.keys(imported.files)).toEqual(['/src/App.tsx'])
    const blob = await exportZip(imported.files, 'Partial')
    const out = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(out.files)).toContain('partial/package.json')
  })
})

describe('diff helpers', () => {
  it('counts line changes', () => {
    expect(countLineChanges('a\nb\nc\n', 'a\nB\nc\nd\n')).toEqual({ added: 2, removed: 1 })
    expect(diffSnapshots({ '/a': { c: '1', e: 'utf8' } }, { '/a': { c: '1', e: 'utf8' } })).toEqual([])
  })
})
