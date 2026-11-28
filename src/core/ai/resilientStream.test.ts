// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ArtifactStreamParser, type ParserEvent } from './parser'
import {
  DraftTracker, StreamStallError, buildContinuationMessages, runResilient, statusText, stitchContinuation, tailLines, watchdogStream,
  type ResilientOptions,
} from './resilientStream'
import { MemoryAdapter } from '@/core/vfs/memoryAdapter'
import { createProject } from '@/core/vfs/projects'
import { VirtualFileSystem } from '@/core/vfs/vfs'
import { runTurn } from './orchestrator'
import { getProvider } from './providers'
import { ProviderError, type LLMMessage, type StreamChunk } from './types'

const text = (t: string): StreamChunk => ({ type: 'text', text: t })
/** A stream that yields `chunks`, then either ends, throws, or hangs until aborted. */
function script(chunks: string[], tail: 'end' | 'stall' | Error = 'end') {
  return (_m: LLMMessage[], signal: AbortSignal): AsyncIterable<StreamChunk> => (async function* () {
    for (const c of chunks) yield text(c)
    if (tail === 'end') return
    if (tail instanceof Error) throw tail
    await new Promise<void>((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }))
  })()
}
/** Opener that serves a different script on each successive call and records the messages it was given. */
function sequence(...steps: ReturnType<typeof script>[]) {
  const calls: LLMMessage[][] = []
  const open: ResilientOptions['open'] = (m, s) => { calls.push(m); const step = steps[Math.min(calls.length - 1, steps.length - 1)]; return step(m, s) }
  return { open, calls }
}
const base: LLMMessage[] = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'build it' }]
const fast = { stallMs: 25, ttftMs: 25, backoffMs: 0 }
function collect() {
  const events: ParserEvent[] = []
  return { events, handle: (e: ParserEvent) => { events.push(e) }, ends: () => events.filter((e) => e.type === 'file-end') as Extract<ParserEvent, { type: 'file-end' }>[] }
}
const lines = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `const line${from + i} = ${from + i}`).join('\n')

describe('parser.flushInterrupted', () => {
  it('drops a dangling mid-tag fragment instead of leaking it as text', () => {
    const p = new ArtifactStreamParser()
    const evs = [...p.push('Working on it.\n<create_file path="/src/Ap')]
    const out = p.flushInterrupted()
    expect(out.danglingTag).toBe('<create_file path="/src/Ap')
    const all = [...evs, ...out.events]
    expect(all.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join('')).toBe('Working on it.\n')
  })
  it('keeps everything streamed of an open file as file-end{complete:false}', () => {
    const p = new ArtifactStreamParser()
    p.push('<create_file path="/a.ts">\nline1\nline2\nli')
    const { events, danglingTag } = p.flushInterrupted()
    expect(danglingTag).toBeUndefined()
    const end = events.find((e) => e.type === 'file-end') as Extract<ParserEvent, { type: 'file-end' }>
    expect(end).toMatchObject({ path: '/a.ts', complete: false, content: 'line1\nline2\nli' })
  })
})

describe('stitchContinuation (overlap de-duplication)', () => {
  it('strips exactly repeated lines', () => {
    const partial = 'import x from "y"\nfunction a() {\n  return 1234567890\n}\nfunction b() {'
    const cont = 'function a() {\n  return 1234567890\n}\nfunction b() {\n  return 2\n}'
    expect(stitchContinuation(partial, cont)).toBe('import x from "y"\nfunction a() {\n  return 1234567890\n}\nfunction b() {\n  return 2\n}')
  })
  it('repairs a mid-line cut (fragment is a prefix of the continuation line)', () => {
    expect(stitchContinuation('const a = 1\nexport const longName = compute(', 'export const longName = compute(a, b)\nexport default longName')).toBe('const a = 1\nexport const longName = compute(a, b)\nexport default longName')
  })
  it('does not eat a legitimate short repeated line like "}"', () => {
    expect(stitchContinuation('if (a) {\n  b()\n}', '}\nconst c = 1')).toBe('if (a) {\n  b()\n}\n}\nconst c = 1')
  })
  it('appends untouched when nothing overlaps; handles empty sides and CRLF', () => {
    expect(stitchContinuation('const first = 1;', 'const second = 2;')).toBe('const first = 1;\nconst second = 2;')
    expect(stitchContinuation('', 'x')).toBe('x')
    expect(stitchContinuation('abc', '  ')).toBe('abc')
    expect(stitchContinuation('const firstLineHere = 1\r\n', 'const firstLineHere = 1\r\nnext')).toBe('const firstLineHere = 1\nnext')
  })
})

describe('watchdogStream', () => {
  it('fires a stall error after the chunk gap and aborts the underlying fetch', async () => {
    let aborted = false
    const open = (signal: AbortSignal) => (async function* () {
      yield text('a')
      await new Promise((_, rej) => signal.addEventListener('abort', () => { aborted = true; rej(new Error('x')) }, { once: true }))
    })()
    const got: string[] = []
    await expect((async () => { for await (const c of watchdogStream(open, { stallMs: 20, ttftMs: 500 })) got.push((c as { text: string }).text) })()).rejects.toMatchObject({ name: 'StreamStallError', phase: 'stall' })
    expect(got).toEqual(['a'])
    expect(aborted).toBe(true)
  })
  it('uses the separate (longer) time-to-first-token budget before the first chunk', async () => {
    const open = (signal: AbortSignal) => (async function* () {
      await new Promise((r) => setTimeout(r, 60)) // slower than stallMs, faster than ttftMs → must NOT stall
      yield text('late')
      await new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('x')), { once: true }))
    })()
    const it = watchdogStream(open, { stallMs: 20, ttftMs: 400 })
    expect((await it.next()).value).toEqual(text('late'))
    await expect(it.next()).rejects.toBeInstanceOf(StreamStallError)
    const slow = (signal: AbortSignal) => (async function* () { await new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('x')), { once: true })); yield text('never') })()
    await expect(watchdogStream(slow, { ttftMs: 20 }).next()).rejects.toMatchObject({ phase: 'ttft' })
  })
})

describe('runResilient — continuation, stitching and caps', () => {
  it('mid-file stall → automatic continuation from the last 25 lines, stitched without duplicates', async () => {
    const first = lines(30)
    const open = sequence(
      script([`Starting.\n<create_file path="/src/Big.ts">\n${first}\n`], 'stall'),
      script([`<create_file path="/src/Big.ts">\n${lines(5, 26)}\n${lines(5, 31)}\n</create_file>\nDone.`]),
    )
    const c = collect()
    const status: string[] = []
    const r = await runResilient({ messages: base, open: open.open, handle: c.handle, onStatus: (s) => status.push(statusText(s)), ...fast })
    expect(r.recoveries).toBe(1)
    expect(r.interrupted).toEqual([])
    expect(c.ends()).toHaveLength(1)
    expect(c.ends()[0]).toMatchObject({ path: '/src/Big.ts', complete: true, content: lines(35) })
    // continuation prompt: exact tail context + strict "continue from next line"
    const last = open.calls[1][open.calls[1].length - 1].content as string
    expect(last).toContain('/src/Big.ts')
    expect(last).toContain(tailLines(first.trim(), 25))
    expect(last).not.toContain('const line5 =') // beyond the 25-line tail
    expect(last).toMatch(/strictly from the very next line/)
    expect(status.some((s) => /Stream stalled at line \d+ of \/src\/Big\.ts — resuming automatically \(1\/2\)/.test(s))).toBe(true)
    expect(status.some((s) => /^Writing \/src\/Big\.ts · \d+ lines/.test(s))).toBe(true)
  })

  it('mid-tag cutoff never leaks a half tag, then retries the whole reply', async () => {
    const open = sequence(
      script(['I will add it.\n<create_file path="/src/A'], new ProviderError('Could not reach X.')),
      script(['<create_file path="/src/A.ts">\nexport const A = 1\n</create_file>']),
    )
    const c = collect()
    const r = await runResilient({ messages: base, open: open.open, handle: c.handle, ...fast })
    const textOut = c.events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join('')
    expect(textOut).toBe('I will add it.\n')
    expect(c.ends()).toHaveLength(1)
    expect(c.ends()[0].path).toBe('/src/A.ts')
    expect(r.recoveries).toBe(1)
    expect((open.calls[1][open.calls[1].length - 1].content as string)).toMatch(/TIGHTER/)
  })

  it('a file that failed before meaningful output is retried with a tighter patch-first instruction', async () => {
    const open = sequence(script(['<create_file path="/src/T.ts">\nx'], 'stall'), script(['<create_file path="/src/T.ts">\nexport const T = 1\n</create_file>']))
    const c = collect()
    await runResilient({ messages: base, open: open.open, handle: c.handle, ...fast })
    const prompt = open.calls[1][open.calls[1].length - 1].content as string
    expect(prompt).toMatch(/TIGHTER/)
    expect(prompt).toMatch(/patch_file/)
    expect(c.ends()[0]).toMatchObject({ path: '/src/T.ts', content: 'export const T = 1' })
  })

  it('caps automatic recovery at 2 attempts then returns the partial as an InterruptedOp', async () => {
    const open = sequence(script([`<create_file path="/src/Dash.tsx">\n${lines(148)}\n`], 'stall'), script([`<create_file path="/src/Dash.tsx">\n`], 'stall'), script([`<create_file path="/src/Dash.tsx">\n`], 'stall'))
    const c = collect()
    const r = await runResilient({ messages: base, open: open.open, handle: c.handle, ...fast })
    expect(open.calls).toHaveLength(3) // 1 original + 2 continuations, never a 4th
    expect(r.recoveries).toBe(2)
    expect(c.ends()).toHaveLength(0)
    expect(r.interrupted).toHaveLength(1)
    expect(r.interrupted[0]).toMatchObject({ path: '/src/Dash.tsx', op: 'create', reason: 'stall', attempts: 2 })
    expect(r.interrupted[0].linesStreamed).toBe(148)
    expect(r.interrupted[0].partialContent).toBe(lines(148))
    expect(r.error).toBeInstanceOf(StreamStallError)
  })

  it('partial salvage: files completed before the cut are delivered, only the cut file is interrupted', async () => {
    const open = sequence(script(['<create_file path="/src/One.ts">\nexport const One = 1\n</create_file>\n<create_file path="/src/Two.ts">\nexport const Two = 2\nexport const Tw'], new ProviderError('Could not reach X.')))
    const c = collect()
    const r = await runResilient({ messages: base, open: open.open, handle: c.handle, maxContinuations: 0, ...fast })
    expect(c.ends().map((e) => e.path)).toEqual(['/src/One.ts'])
    expect(r.interrupted.map((i) => i.path)).toEqual(['/src/Two.ts'])
    expect(r.interrupted[0].partialContent).toBe('export const Two = 2\nexport const Tw')
  })

  it('non-retryable provider errors (bad key) do not burn retries but still salvage', async () => {
    const open = sequence(script(['<create_file path="/a.ts">\nexport const a = 1\n</create_file>'], new ProviderError('Unauthorized', 401)))
    const c = collect()
    const r = await runResilient({ messages: base, open: open.open, handle: c.handle, ...fast })
    expect(open.calls).toHaveLength(1)
    expect(r.recoveries).toBe(0)
    expect(c.ends()).toHaveLength(1)
    expect(r.error).toMatchObject({ status: 401 })
  })

  it('lock enforcement: a locked file is never continued (no tokens spent) and is handed over for applyOp to skip', async () => {
    const open = sequence(script([`<create_file path="/src/locked.ts">\n${lines(10)}\n`], 'stall'), script(['should not be called']))
    const c = collect()
    const r = await runResilient({ messages: base, open: open.open, handle: c.handle, isLocked: (p) => p === '/src/locked.ts', ...fast })
    expect(open.calls).toHaveLength(1)
    expect(r.recoveries).toBe(0)
    expect(r.interrupted).toEqual([])
    expect(c.ends()[0]).toMatchObject({ path: '/src/locked.ts', complete: true })
  })

  it('abort safety: aborting mid-stream stops immediately, never retries, keeps the partial', async () => {
    const ctl = new AbortController()
    const open = sequence(script([`<create_file path="/src/Ab.ts">\n${lines(6)}\n`], 'stall'), script(['nope']))
    const c = collect()
    setTimeout(() => ctl.abort(), 5)
    const r = await runResilient({ messages: base, open: open.open, handle: c.handle, signal: ctl.signal, stallMs: 5000, ttftMs: 5000, backoffMs: 0 })
    expect(r.aborted).toBe(true)
    expect(open.calls).toHaveLength(1)
    expect(r.recoveries).toBe(0)
    expect(r.interrupted[0]).toMatchObject({ path: '/src/Ab.ts', reason: 'aborted', partialContent: lines(6) })
    expect(r.error?.name).toBe('AbortError')
  })

  it('abort during back-off also stops without another request', async () => {
    const ctl = new AbortController()
    const open = sequence(script([`<create_file path="/src/Ab.ts">\n${lines(6)}\n`], 'stall'), script(['nope']))
    const r = await runResilient({ messages: base, open: open.open, handle: () => {}, signal: ctl.signal, stallMs: 15, ttftMs: 15, backoffMs: 200, sleep: (ms, sig) => new Promise((res) => { ctl.abort(); setTimeout(res, Math.min(ms, 1)); sig?.addEventListener('abort', () => res()) }) })
    expect(r.aborted).toBe(true)
    expect(open.calls).toHaveLength(1)
    expect(r.interrupted).toHaveLength(1)
  })

  it('accepts a tag-less continuation (plain code / fenced) and stitches it', async () => {
    const open = sequence(script([`<create_file path="/src/Loose.ts">\n${lines(4)}\n`], 'stall'), script(['Sure, here is the rest:\n```ts\n' + lines(3, 4) + '\n```']))
    const c = collect()
    await runResilient({ messages: base, open: open.open, handle: c.handle, ...fast })
    expect(c.ends()[0].content).toBe(lines(6))
  })

  it('resume seed continues an interrupted file from its saved partial', async () => {
    const open = sequence(script([`<create_file path="/src/R.ts">\n${lines(2, 5)}\n</create_file>`]))
    const c = collect()
    const r = await runResilient({ messages: base, open: open.open, handle: c.handle, seed: { path: '/src/R.ts', op: 'create', partial: lines(5) }, ...fast })
    expect(c.ends()[0]).toMatchObject({ path: '/src/R.ts', content: lines(6) })
    expect(r.interrupted).toEqual([])
  })

  it('buildContinuationMessages alternates roles and tells the model what is already saved', () => {
    const m = buildContinuationMessages(base, { path: '/a.ts', partial: lines(40), reason: 'truncated', saved: ['/b.ts'] })
    expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(m[3].content as string).toContain('/b.ts')
    expect((m[3].content as string).split('const line').length - 1).toBe(25)
  })
  it('DraftTracker follows live per-file progress', () => {
    const d = new DraftTracker()
    d.start('/a.ts', 'create')
    d.delta('/a.ts', 'a\nb')
    expect(d.get('/a.ts')).toMatchObject({ linesStreamed: 2, bytesStreamed: 3, completed: false, partialContent: 'a\nb' })
    d.complete('/a.ts', 'a\nb\nc')
    expect(d.open()).toHaveLength(0)
  })
})

describe('runTurn integration — resume end-to-end against a real VFS', () => {
  const sse = (objs: unknown[]) => objs.map((o) => `data: ${typeof o === 'string' ? o : JSON.stringify(o)}\n\n`).join('')
  const reply = (content: string, cut = false) => sse([{ choices: [{ delta: { content } }] }, ...(cut ? [] : ['[DONE]'])])
  async function vfsWith() {
    const a = new MemoryAdapter()
    const meta = await createProject(a, { name: 'P', files: { '/src/App.tsx': 'export default function App() {\n  return null\n}\n', '/src/locked.ts': 'export const L = 1', '/package.json': '{}' } })
    const vfs = await VirtualFileSystem.open(a, meta.id)
    await vfs.lock('/src/locked.ts')
    return vfs
  }
  const fetchSeq = (...bodies: string[]) => { let i = 0; return (async () => new Response(new TextEncoder().encode(bodies[Math.min(i++, bodies.length - 1)]), { status: 200 })) as unknown as typeof fetch }

  it('auto-continues a cut-off file, saves it complete, and checkpoints the turn', async () => {
    const vfs = await vfsWith()
    const full = lines(8)
    const res = await runTurn({
      vfs, provider: getProvider('openai')!, model: 'gpt', apiKey: 'k', mode: 'build', history: [], userText: 'add dashboard', resilience: { backoffMs: 0 },
      fetchImpl: fetchSeq(reply(`<create_file path="/src/One.ts">\nexport const One = 1\n</create_file>\n<create_file path="/src/Dash.ts">\n${lines(5)}\n`, true), reply(`<create_file path="/src/Dash.ts">\n${lines(4, 5)}\n</create_file>\nDone`)),
    })
    expect(res.ops.map((o) => [o.path, o.status])).toEqual([['/src/One.ts', 'applied'], ['/src/Dash.ts', 'applied']])
    expect(vfs.read('/src/Dash.ts')).toBe(full)
    expect(res.recoveries).toBe(1)
    expect(res.interrupted).toEqual([])
    expect(res.checkpointAfter).toBeTruthy()
  })

  it('exhausted retries keep applied files, mark the cut file interrupted, and Resume finishes it in place', async () => {
    const vfs = await vfsWith()
    const cut = reply(`<create_file path="/src/One.ts">\nexport const One = 1\n</create_file>\n<create_file path="/src/Dash.ts">\n${lines(5)}\n`, true)
    const first = await runTurn({ vfs, provider: getProvider('openai')!, model: 'gpt', apiKey: 'k', mode: 'build', history: [], userText: 'add dashboard', resilience: { backoffMs: 0, maxContinuations: 0 }, fetchImpl: fetchSeq(cut) })
    expect(first.ops.map((o) => [o.path, o.status])).toEqual([['/src/One.ts', 'applied'], ['/src/Dash.ts', 'interrupted']])
    expect(vfs.has('/src/Dash.ts')).toBe(false)
    expect(first.ops[1]).toMatchObject({ partial: lines(5), lines: 5 })
    expect(first.ops[1].detail).toBe('1/2 files saved · /src/Dash.ts interrupted at line 5.')
    expect(first.checkpointAfter).toBeTruthy() // the turn is undoable even though it was cut off
    const opId = first.ops[1].id
    const events: string[] = []
    const resumed = await runTurn({
      vfs, provider: getProvider('openai')!, model: 'gpt', apiKey: 'k', mode: 'build', history: [], userText: 'add dashboard', resilience: { backoffMs: 0 },
      resume: { opId, path: '/src/Dash.ts', op: 'create', partial: first.ops[1].partial! },
      onEvent: (e) => events.push(e.type), fetchImpl: fetchSeq(reply(`<create_file path="/src/Dash.ts">\n${lines(4, 5)}\n</create_file>`)),
    })
    expect(resumed.ops).toHaveLength(1)
    expect(resumed.ops[0]).toMatchObject({ id: opId, status: 'applied' })
    expect(vfs.read('/src/Dash.ts')).toBe(lines(8))
    expect(events).toContain('op-progress')
  })

  it('a locked file that gets cut off is skipped, not continued', async () => {
    const vfs = await vfsWith()
    let calls = 0
    const f = (async () => { calls++; return new Response(new TextEncoder().encode(reply(`<update_file path="/src/locked.ts">\n${lines(6)}\n`, true)), { status: 200 }) }) as unknown as typeof fetch
    const res = await runTurn({ vfs, provider: getProvider('openai')!, model: 'gpt', apiKey: 'k', mode: 'build', history: [], userText: 'x', resilience: { backoffMs: 0 }, fetchImpl: f })
    expect(calls).toBe(1)
    expect(res.ops[0].status).toBe('skipped-locked')
    expect(vfs.read('/src/locked.ts')).toBe('export const L = 1')
  })
})
