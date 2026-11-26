import { describe, expect, it } from 'vitest'
import { followUpSuggestions } from './followUpSuggestions'
import { assignVersions, isVersionTurn, versionCheckpoint, versionTitle, type VersionMsg } from './versions'
import { deriveSteps, formatElapsed } from './buildSteps'
import { moveActive, scrollTopFor, selectableRows } from '@/ui/chat/pickerNav'

const msgs: VersionMsg[] = [
  { id: 'u1', role: 'user', text: 'Build a landing page with a hero and features section for my startup, make it pop' },
  { id: 'a1', role: 'assistant', text: 'ok', ops: [{ status: 'applied', path: '/src/App.tsx' }], checkpointAfter: 'cp1' },
  { id: 'u2', role: 'user', text: 'Chat only' },
  { id: 'a2', role: 'assistant', text: 'sure', ops: [] },
  { id: 'u3', role: 'user', text: 'Add footer' },
  { id: 'a3', role: 'assistant', text: 'done', ops: [{ status: 'failed', path: '/x' }, { status: 'applied', path: '/src/Footer.tsx' }], checkpointAfter: 'cp3', undone: true },
  { id: 'a4', role: 'assistant', text: '', ops: [{ status: 'applied', path: '/y' }], streaming: true },
]

describe('inline version cards', () => {
  it('numbers only completed assistant turns that applied file ops, keeping undone turns', () => {
    const v = assignVersions(msgs)
    expect([...v.entries()]).toEqual([['a1', 1], ['a3', 2]])
    expect(isVersionTurn(msgs[3]!)).toBe(false)
    expect(isVersionTurn(msgs[6]!)).toBe(false)
  })
  it('links each version to its checkpoint and derives a concise title', () => {
    expect(versionCheckpoint(msgs[1]!)).toBe('cp1')
    expect(versionTitle(msgs, 'a1').length).toBeLessThanOrEqual(60)
    expect(versionTitle(msgs, 'a1').endsWith('…')).toBe(true)
    expect(versionTitle(msgs, 'a3')).toBe('Add footer')
    expect(versionTitle([{ id: 'z', role: 'assistant', text: '', ops: [{ status: 'applied', path: '/src/Card.tsx' }] }], 'z')).toBe('Edited Card.tsx')
  })
})

describe('follow-up suggestions', () => {
  const plain = { '/src/App.tsx': 'export default function App(){ const [n,setN]=useState(0); return <div className="hero">Get started features</div> }', '/src/index.css': 'body{margin:0}' }
  it('returns 2–3 deterministic, relevant chips', () => {
    const a = followUpSuggestions({ files: plain })
    expect(a).toEqual(followUpSuggestions({ files: plain }))
    expect(a.length).toBeGreaterThanOrEqual(2)
    expect(a.length).toBeLessThanOrEqual(3)
    expect(a[0]).toBe('Make it fully mobile responsive')
    expect(a).toContain('Add a dark/light theme toggle')
  })
  it('skips things the project already has and anything already requested', () => {
    const rich = { '/src/App.tsx': 'className="md:flex dark:bg-black transition aria-label supabase pricing localStorage useState loading"' }
    const out = followUpSuggestions({ files: rich })
    expect(out).not.toContain('Make it fully mobile responsive')
    expect(out).not.toContain('Connect Supabase backend')
    expect(followUpSuggestions({ files: plain, exclude: ['make it fully mobile responsive'] })).not.toContain('Make it fully mobile responsive')
  })
  it('returns nothing for an empty project', () => { expect(followUpSuggestions({ files: {} })).toEqual([]) })
})

describe('build activity steps', () => {
  it('walks reading → editing → compiling → ready', () => {
    const op = { id: 'o1', op: 'patch' as const, path: '/src/App.tsx', status: 'applied', added: 38, removed: 6 }
    const s1 = deriveSteps({ ops: [{ ...op, status: 'streaming' }], streaming: true, previewStatus: 'idle' })
    expect(s1.map((s) => s.state)).toEqual(['done', 'active'])
    const s2 = deriveSteps({ ops: [op], streaming: true, previewStatus: 'building' })
    expect(s2.map((s) => s.label)).toEqual(['Reading project map', 'Editing /src/App.tsx +38/-6', 'Compiling preview…'])
    const s3 = deriveSteps({ ops: [op], streaming: false, previewStatus: 'ready', healing: true })
    expect(s3.map((s) => s.label)).toContain('Auto-healing…')
    const s4 = deriveSteps({ ops: [op], streaming: false, previewStatus: 'ready' })
    expect(s4[s4.length - 1]).toMatchObject({ label: 'Preview ready', state: 'done' })
  })
  it('flags locked and failed ops as errors and formats elapsed time', () => {
    const s = deriveSteps({ ops: [{ id: 'a', op: 'update', path: '/a', status: 'skipped-locked' }, { id: 'b', op: 'create', path: '/b', status: 'failed' }], streaming: false, previewStatus: 'idle' })
    expect(s.slice(1).map((x) => x.state)).toEqual(['error', 'error'])
    expect([formatElapsed(3000), formatElapsed(125000)]).toEqual(['3s', '2m 5s'])
  })
})

describe('model picker keyboard navigation', () => {
  const rows = [{ t: 'section' }, { t: 'head' }, { t: 'model' }, { t: 'model' }, { t: 'note' }, { t: 'head' }, { t: 'skeleton' }]
  const sel = selectableRows(rows)
  it('selects only headers and model rows', () => { expect(sel).toEqual([1, 2, 3, 5]) })
  it('ArrowDown/ArrowUp move and wrap; Home/End jump', () => {
    expect(moveActive(sel, -1, 'ArrowDown')).toBe(1)
    expect(moveActive(sel, 1, 'ArrowDown')).toBe(2)
    expect(moveActive(sel, 5, 'ArrowDown')).toBe(1)
    expect(moveActive(sel, -1, 'ArrowUp')).toBe(5)
    expect(moveActive(sel, 1, 'ArrowUp')).toBe(5)
    expect(moveActive(sel, 3, 'Home')).toBe(1)
    expect(moveActive(sel, 1, 'End')).toBe(5)
    expect(moveActive([], 0, 'ArrowDown')).toBe(-1)
  })
  it('scrolls the virtual window just enough to reveal the active row', () => {
    expect(scrollTopFor(2, 36, 0, 400)).toBe(0)
    expect(scrollTopFor(30, 36, 0, 400)).toBe(30 * 36 + 36 - 400)
    expect(scrollTopFor(1, 36, 360, 400)).toBe(36)
  })
})
