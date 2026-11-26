import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '@/core/vfs/memoryAdapter'
import { createProject } from '@/core/vfs/projects'
import { VirtualFileSystem } from '@/core/vfs/vfs'
import { applyOp } from './apply'
import { clampAgentSteps, parseToolCalls, runAgentLoop, type AgentDeps, type AgentError } from './agentLoop'
import { buildSymbolGraph, buildRepoMap, extractSymbols, formatSymbols, resolveImport } from './repoMap'

const file = (tag: string, path: string, body: string) => `<${tag} path="${path}">\n${body}\n</${tag}>`

async function project(extra: Record<string, string> = {}) {
  const a = new MemoryAdapter()
  const files: Record<string, { c: string; e: 'utf8' }> = { '/src/App.tsx': { c: 'export default function App(){ return <h1>Hi</h1> }', e: 'utf8' }, '/src/lib.ts': { c: 'export const n = 1', e: 'utf8' } }
  for (const [p, c] of Object.entries(extra)) files[p] = { c, e: 'utf8' }
  const meta = await createProject(a, { name: 'Agent', files })
  return VirtualFileSystem.open(a, meta.id)
}

function harness(vfs: VirtualFileSystem, script: string[], opts: { failWhen?: (vfs: VirtualFileSystem) => AgentError[]; aborted?: () => boolean } = {}) {
  const calls: { step: number; observations: string[] }[] = []
  let verifies = 0
  const deps: AgentDeps = {
    model: async (p) => { calls.push({ step: p.step, observations: p.observations }); return { text: script[Math.min(calls.length - 1, script.length - 1)]! } },
    readFile: (p) => vfs.read(p),
    listFiles: () => vfs.paths(),
    search: (q) => vfs.search(q).map((h) => ({ path: h.path, line: h.line, text: h.text })),
    applyOp: async (op, path, content) => applyOp(vfs, op, path, content),
    verify: async () => { verifies++; const errors = opts.failWhen?.(vfs) ?? []; return { ok: errors.length === 0, errors } },
    isAborted: opts.aborted,
  }
  return { deps, calls, verifies: () => verifies }
}
const broken = (v: VirtualFileSystem): AgentError[] => (v.read('/src/App.tsx')?.includes('BROKEN') ? [{ message: 'Unexpected token BROKEN', file: '/src/App.tsx', line: 1 }] : [])

describe('multi-step agent loop', () => {
  it('parses read-only tool tags', () => {
    expect(parseToolCalls('x <read_file path="/a.ts" /> <list_files/> <search_project query="foo bar"/> <verify_build />')).toEqual([
      { tool: 'read_file', path: '/a.ts', query: undefined }, { tool: 'list_files', path: undefined, query: undefined }, { tool: 'search_project', path: undefined, query: 'foo bar' }, { tool: 'verify_build', path: undefined, query: undefined }])
  })
  it('read_file → edit → verify fails → self-heal → green', async () => {
    const vfs = await project()
    const h = harness(vfs, ['Let me look. <read_file path="/src/App.tsx" />', file('update_file', '/src/App.tsx', 'export default function App(){ return BROKEN }'), file('update_file', '/src/App.tsx', 'export default function App(){ return <h1>Fixed</h1> }')], { failWhen: broken })
    const r = await runAgentLoop(h.deps, { maxSteps: 4 })
    expect(r.status).toBe('green')
    expect(r.stepsUsed).toBe(3)
    expect(r.applied).toBe(2)
    expect(h.calls[1]!.observations[0]).toContain('read_file /src/App.tsx')
    expect(h.calls[1]!.observations[0]).toContain('return <h1>Hi</h1>')
    expect(h.calls[2]!.observations.join()).toContain('BUILD FAILED')
    expect(h.calls[2]!.observations.join()).toContain('Unexpected token BROKEN')
    expect(vfs.read('/src/App.tsx')).toContain('Fixed')
    expect(r.steps.map((s) => s.tool)).toEqual(expect.arrayContaining(['read_file', 'update_file', 'verify_build']))
  })
  it('direct artifacts without tool requests apply, verify once and stop (backward compatible)', async () => {
    const vfs = await project()
    const h = harness(vfs, [file('create_file', '/src/New.tsx', 'export const X = 1')])
    const r = await runAgentLoop(h.deps, { maxSteps: 3 })
    expect(r).toMatchObject({ status: 'green', stepsUsed: 1, applied: 1 })
    expect(h.verifies()).toBe(1)
    expect(vfs.has('/src/New.tsx')).toBe(true)
  })
  it('startWithVerify returns immediately when the build is already green', async () => {
    const vfs = await project()
    const h = harness(vfs, ['unused'])
    const r = await runAgentLoop(h.deps, { maxSteps: 3, startWithVerify: true })
    expect(r).toMatchObject({ status: 'green', stepsUsed: 0 })
    expect(h.calls).toHaveLength(0)
  })
  it('enforces file locks inside the loop and reports the rejection to the model', async () => {
    const vfs = await project()
    await vfs.lock('/src/App.tsx')
    const h = harness(vfs, [file('update_file', '/src/App.tsx', 'HACKED'), 'ok, I will leave it alone.'])
    const r = await runAgentLoop(h.deps, { maxSteps: 3 })
    expect(vfs.read('/src/App.tsx')).not.toContain('HACKED')
    expect(r.skippedLocked).toEqual(['/src/App.tsx'])
    expect(r.applied).toBe(0)
    expect(h.calls[1]!.observations.join()).toContain('LOCKED')
    expect(r.status).toBe('answered')
  })
  it('never exceeds the max-steps safety guard (even for an endless inspector or failing build)', async () => {
    const vfs = await project()
    const inspector = harness(vfs, ['<list_files />'])
    const r1 = await runAgentLoop(inspector.deps, { maxSteps: 3 })
    expect(r1.status).toBe('max-steps')
    expect(inspector.calls).toHaveLength(3)
    const failing = harness(vfs, [file('update_file', '/src/App.tsx', 'BROKEN')], { failWhen: broken })
    const r2 = await runAgentLoop(failing.deps, { maxSteps: 2 })
    expect(r2.status).toBe('max-steps')
    expect(failing.calls).toHaveLength(2)
    expect(r2.errors.length).toBe(1)
    expect([clampAgentSteps(0), clampAgentSteps(9), clampAgentSteps(undefined), clampAgentSteps(4)]).toEqual([1, 5, 3, 4])
    expect((await runAgentLoop(inspector.deps, { maxSteps: 99 })).stepsUsed).toBe(5)
  })
  it('abort cancels before the next model call and after an in-flight turn', async () => {
    const vfs = await project()
    let stop = false
    const h = harness(vfs, ['<list_files />', '<list_files />'], { aborted: () => stop })
    const orig = h.deps.model
    h.deps.model = async (p) => { const r = await orig(p); if (p.step === 1) stop = true; return r }
    const r = await runAgentLoop(h.deps, { maxSteps: 5 })
    expect(r.status).toBe('aborted')
    expect(h.calls).toHaveLength(1)
    stop = true
    const pre = harness(vfs, ['x'], { aborted: () => true })
    expect((await runAgentLoop(pre.deps, { maxSteps: 3 })).status).toBe('aborted')
    expect(pre.calls).toHaveLength(0)
  })
  it('search_project observations contain matching lines', async () => {
    const vfs = await project()
    const h = harness(vfs, ['<search_project query="Hi" />', 'done'])
    await runAgentLoop(h.deps, { maxSteps: 3 })
    expect(h.calls[1]!.observations[0]).toContain('/src/App.tsx')
  })
})

describe('upgraded symbol & dependency graph', () => {
  const src = `import { Button } from './Button'\nimport { useStore } from '@/store/app'\nexport interface CardProps { title: string }\nexport type Mode = 'a' | 'b'\nexport const Card = ({ title }: CardProps) => <div>{title}</div>\nexport const Fancy = memo(({ x }: FancyProps) => <i>{x}</i>)\nexport function Panel(props: PanelProps) { return null }\nexport const Tag: React.FC<TagProps> = () => null\nexport const useThing = () => 1\nexport const useApp = create<AppState>()((set) => ({}))\nexport * from './more'\nexport { Other } from './other'`
  const s = extractSymbols('/src/Card.tsx', src)
  const by = (n: string) => s.exports.find((e) => e.name === n)
  it('captures prop interface names for arrow, memo, function and FC components', () => {
    expect([by('Card')?.props, by('Fancy')?.props, by('Panel')?.props, by('Tag')?.props]).toEqual(['CardProps', 'FancyProps', 'PanelProps', 'TagProps'])
    expect(by('Card')?.kind).toBe('component')
  })
  it('distinguishes custom hooks from store slices and keeps type aliases', () => {
    expect([by('useThing')?.kind, by('useApp')?.kind, by('Mode')?.kind, by('CardProps')?.kind]).toEqual(['hook', 'store', 'type', 'interface'])
  })
  it('records re-exports and formats props in the compact line', () => {
    expect(s.reexports).toEqual(['./more', './other'])
    const line = formatSymbols(s)
    expect(line).toContain('Card (component, props: CardProps)')
    expect(line).toContain('useApp (store)')
    expect(line).toContain('re-exports: ./more, ./other')
  })
  it('resolves local import edges (relative, @/ alias, index files) and ignores packages', () => {
    const paths = new Set(['/src/App.tsx', '/src/Button.tsx', '/src/store/app.ts', '/src/ui/index.ts'])
    expect(resolveImport('/src/App.tsx', './Button', paths)).toBe('/src/Button.tsx')
    expect(resolveImport('/src/App.tsx', '@/store/app', paths)).toBe('/src/store/app.ts')
    expect(resolveImport('/src/App.tsx', './ui', paths)).toBe('/src/ui/index.ts')
    expect(resolveImport('/src/ui/index.ts', '../Button', paths)).toBe('/src/Button.tsx')
    expect(resolveImport('/src/App.tsx', 'react', paths)).toBeNull()
    expect(resolveImport('/src/App.tsx', './missing', paths)).toBeNull()
  })
  it('builds the cross-file edge graph and appends it to the repo map', () => {
    const files = [
      { path: '/src/App.tsx', content: "import { Card } from './Card'\nimport { useApp } from '@/store/app'\nexport default function App(){ return null }" },
      { path: '/src/Card.tsx', content: "import './card.css'\nexport const Card = ({ t }: CardProps) => null" },
      { path: '/src/store/app.ts', content: 'export const useApp = create<S>()(() => ({}))' },
      { path: '/src/card.css', content: '.card{}' },
    ]
    const g = buildSymbolGraph(files)
    expect(g.edges).toEqual(expect.arrayContaining([{ from: '/src/App.tsx', to: '/src/Card.tsx' }, { from: '/src/App.tsx', to: '/src/store/app.ts' }, { from: '/src/Card.tsx', to: '/src/card.css' }]))
    expect(g.usedBy['/src/Card.tsx']).toEqual(['/src/App.tsx'])
    const m = buildRepoMap(files)
    expect(m.entries).toBe(4)
    expect(m.text).toContain('Local import edges')
    expect(m.text).toContain('/src/App.tsx → /src/Card.tsx, /src/store/app.ts')
  })
})
