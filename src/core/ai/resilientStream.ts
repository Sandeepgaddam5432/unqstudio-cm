/**
 * Zero-failure streaming + resumable write engine (v3.4).
 *
 * Problem it removes: when a model hits its output-token limit, the network drops, a proxy times out or the stream
 * silently stalls mid-file, the old pipeline threw away the half-written file ("nothing was written") and the user had to
 * re-run the whole turn. Here nothing streamed is ever discarded:
 *
 *  1. `watchdogStream` adds a chunk-gap watchdog (28 s stall budget once the stream is live; a separate, longer
 *     time-to-first-token budget) and aborts the underlying fetch when it fires.
 *  2. `runResilient` drives the artifact parser. A cut-off file block (unclosed <create_file>/<update_file>/<patch_file>,
 *     a thrown network error, or a stall) becomes an *interruption*, not a failure. Up to `maxContinuations` (2) automatic
 *     attempts follow with exponential back-off: the model receives the last 25 lines that were saved and must continue from
 *     the next line; the continuation is stitched on with overlap de-duplication (`stitchContinuation`). A file that failed
 *     before any meaningful output is retried with a tighter "concise / patch-first" instruction.
 *  3. When retries are exhausted the partial file is returned as an `InterruptedOp` (never discarded) so the UI can offer
 *     "Resume" / "Retry failed file only"; completed files of the same turn are already persisted by the caller.
 *
 * Pure core: no UI/store imports. Locks are enforced by the caller's `isLocked` (no tokens are spent resuming a file the
 * user locked) and again by `applyOp` at write time.
 */
import { ArtifactStreamParser, cleanFileContent, type FileOpKind, type ParserEvent } from './parser'
import { ProviderError, type LLMMessage, type StreamChunk, type Usage } from './types'

export const DEFAULT_STALL_MS = 28_000
export const DEFAULT_TTFT_MS = 120_000
export const MAX_CONTINUATIONS = 2
export const TAIL_LINES = 25
/** A partial with fewer lines than this is "no meaningful output" → retried concisely instead of stitched. */
export const MEANINGFUL_LINES = 3

export class StreamStallError extends Error {
  constructor(public phase: 'ttft' | 'stall', public ms: number) {
    super(phase === 'ttft' ? `No response from the model within ${Math.round(ms / 1000)}s.` : `The stream stalled — no data for ${Math.round(ms / 1000)}s.`)
    this.name = 'StreamStallError'
  }
}

export type InterruptReason = 'stall' | 'network' | 'truncated' | 'aborted' | 'error'

/** Live per-file streaming progress. */
export interface FileDraft { path: string; op: FileOpKind; linesStreamed: number; bytesStreamed: number; partialContent: string; completed: boolean }

/** A file that was cut off and could not be completed automatically. Persisted on the OpRecord so the user can resume it. */
export interface InterruptedOp { path: string; op: FileOpKind; partialContent: string; linesStreamed: number; reason: InterruptReason; attempts: number }

export type StreamStatus =
  | { phase: 'writing'; path: string; lines: number }
  | { phase: 'stalled'; path?: string; lines?: number; attempt: number; max: number; reason: InterruptReason }
  | { phase: 'retrying'; path?: string; attempt: number; max: number }
  | { phase: 'gave-up'; path?: string; lines?: number }
  | { phase: 'idle' }

export function statusText(s: StreamStatus): string {
  switch (s.phase) {
    case 'writing': return `Writing ${s.path} · ${s.lines} line${s.lines === 1 ? '' : 's'}…`
    case 'stalled': return `${s.reason === 'stall' ? 'Stream stalled' : s.reason === 'truncated' ? 'Response was cut off' : 'Connection dropped'}${s.path ? ` at line ${s.lines ?? 0} of ${s.path}` : ''} — resuming automatically (${s.attempt}/${s.max})…`
    case 'retrying': return `Retrying${s.path ? ` ${s.path}` : ''} with a tighter instruction (${s.attempt}/${s.max})…`
    case 'gave-up': return s.path ? `Interrupted ${s.path} at line ${s.lines ?? 0} — completed files were saved.` : 'Interrupted — completed files were saved.'
    default: return ''
  }
}

export const countLines = (s: string): number => (s ? s.split('\n').length : 0)
export const tailLines = (content: string, n = TAIL_LINES): string => content.split('\n').slice(-n).join('\n')

/** Tracks live progress for every file block of a turn (path → draft). */
export class DraftTracker {
  private drafts = new Map<string, FileDraft>()
  start(path: string, op: FileOpKind, seed = ''): FileDraft {
    const d: FileDraft = { path, op, linesStreamed: countLines(seed), bytesStreamed: seed.length, partialContent: seed, completed: false }
    this.drafts.set(path, d)
    return d
  }
  delta(path: string, text: string): FileDraft | undefined {
    const d = this.drafts.get(path)
    if (!d) return undefined
    d.partialContent += text
    d.bytesStreamed += text.length
    d.linesStreamed = countLines(d.partialContent)
    return d
  }
  complete(path: string, content: string): void { const d = this.drafts.get(path); if (d) { d.completed = true; d.partialContent = content; d.linesStreamed = countLines(content); d.bytesStreamed = content.length } }
  get(path: string): FileDraft | undefined { return this.drafts.get(path) }
  snapshot(): FileDraft[] { return [...this.drafts.values()].map((d) => ({ ...d })) }
  open(): FileDraft[] { return this.snapshot().filter((d) => !d.completed) }
}

/**
 * Join an interrupted file with its continuation, removing lines the model repeated.
 *  - exact overlap: the last k saved lines equal the first k continuation lines → drop them from the continuation;
 *  - fragment overlap: the cut happened mid-line, so the final saved line is a *prefix* of the continuation's line → the
 *    fragment is replaced by the full line.
 * Very short overlaps (< 12 significant chars) are not treated as repeats so a legitimate `}` after `}` survives.
 */
export function stitchContinuation(partial: string, continuation: string): string {
  const a = partial.replace(/\r\n/g, '\n').replace(/\n+$/, '')
  const b = continuation.replace(/\r\n/g, '\n')
  if (!a) return b
  if (!b.trim()) return a
  const A = a.split('\n')
  const B = b.split('\n')
  const max = Math.min(60, A.length, B.length)
  for (let k = max; k >= 1; k--) {
    const tail = A.slice(A.length - k)
    let ok = true
    let sig = 0
    for (let i = 0; i < k; i++) {
      const x = tail[i].trimEnd()
      const y = B[i].trimEnd()
      const last = i === k - 1
      if (x === y || (last && x.trim().length > 0 && y.startsWith(x))) sig += x.trim().length
      else { ok = false; break }
    }
    if (ok && sig >= 12) {
      const fragment = tail[k - 1].trimEnd() !== B[k - 1].trimEnd()
      const head = fragment ? A.slice(0, A.length - 1) : A
      const rest = fragment ? B.slice(k - 1) : B.slice(k)
      return [...head, ...rest].join('\n')
    }
  }
  return a + '\n' + b
}

/** Strip a leading/trailing code fence or prose from a model's tag-less continuation. */
export function extractLooseContinuation(text: string): string {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const fence = /```[\w+-]*\n([\s\S]*?)\n?```/.exec(t)
  return cleanFileContent(fence ? fence[1] : t)
}

export function isRetryable(e: unknown): boolean {
  if (e instanceof StreamStallError) return true
  if (e instanceof ProviderError) return e.status === undefined || e.status >= 500 || e.status === 408 || e.status === 429
  return false
}
export const isAbort = (e: unknown): boolean => (e as Error | undefined)?.name === 'AbortError'

/* ── prompts ───────────────────────────────────────────────────────────────────────────────────────────── */
export function buildContinuationMessages(base: LLMMessage[], a: { path: string; partial: string; reason: InterruptReason; saved: string[] }): LLMMessage[] {
  const n = countLines(a.partial)
  const k = Math.min(TAIL_LINES, n)
  const why = a.reason === 'stall' ? 'the stream stalled' : a.reason === 'truncated' ? 'the reply hit the output limit' : 'the connection dropped'
  return [
    ...base,
    { role: 'assistant', content: `[Interrupted — ${n} lines of ${a.path} were streamed and saved before ${why}.]` },
    {
      role: 'user',
      content: [
        `Your previous reply was cut off while writing ${a.path} after ${n} lines (${why}). Nothing you already wrote was lost.`,
        `Last ${k} line${k === 1 ? '' : 's'} written to ${a.path} (the final line may be incomplete):`,
        '```', tailLines(a.partial), '```',
        `Continue ${a.path} strictly from the very next line. Do NOT repeat any line shown above or anything earlier; if the last line is incomplete, begin with that line completed.`,
        `Respond with ONE <create_file path="${a.path}"> block containing ONLY the remaining content of the file, closed with </create_file>. No explanation, no markdown fences, minimal reasoning.`,
        a.saved.length ? `Already saved this turn — do NOT rewrite: ${a.saved.join(', ')}.` : '',
        'If the original request planned other files that are not saved yet, write them afterwards as normal complete tags (prefer <patch_file> for edits to existing files).',
      ].filter(Boolean).join('\n'),
    },
  ]
}

export function buildRetryMessages(base: LLMMessage[], a: { path?: string; op?: FileOpKind; reason: InterruptReason; saved: string[] }): LLMMessage[] {
  return [
    ...base,
    { role: 'assistant', content: `[My previous reply failed before producing a usable result${a.path ? ` for ${a.path}` : ''}.]` },
    {
      role: 'user',
      content: [
        `Your previous attempt failed before finishing (${a.reason === 'stall' ? 'stalled' : a.reason === 'truncated' ? 'output limit reached' : 'connection dropped'}). Retry now with a TIGHTER response:`,
        '- Keep reasoning to one or two sentences (no long <think>).',
        '- For files that already exist and are longer than ~40 lines use <patch_file> with small SEARCH/REPLACE blocks, not full rewrites.',
        '- Split big new files into smaller focused files/components.',
        a.path ? `Write ONLY ${a.path}${a.op === 'patch' ? ' (as a <patch_file>)' : ' (complete file)'} plus any still-missing files.` : 'Write only the files that are still missing.',
        a.saved.length ? `Already saved this turn — do NOT rewrite: ${a.saved.join(', ')}. If everything is already done, reply with a one-line summary only.` : '',
      ].filter(Boolean).join('\n'),
    },
  ]
}

/* ── watchdog ──────────────────────────────────────────────────────────────────────────────────────────── */
export interface WatchdogOptions { stallMs?: number; ttftMs?: number; signal?: AbortSignal }

/**
 * Wrap a stream with a chunk-gap watchdog. `open` receives a signal that is aborted on stall, on caller abort and on
 * completion so the underlying fetch is always released.
 */
export async function* watchdogStream(open: (signal: AbortSignal) => AsyncIterable<StreamChunk>, o: WatchdogOptions = {}): AsyncGenerator<StreamChunk> {
  const stallMs = o.stallMs ?? DEFAULT_STALL_MS
  const ttftMs = o.ttftMs ?? DEFAULT_TTFT_MS
  const ctl = new AbortController()
  const onAbort = () => ctl.abort()
  if (o.signal?.aborted) ctl.abort(); else o.signal?.addEventListener('abort', onAbort, { once: true })
  const it = open(ctl.signal)[Symbol.asyncIterator]()
  let first = true
  try {
    for (;;) {
      if (o.signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
      const limit = first ? ttftMs : stallMs
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new StreamStallError(first ? 'ttft' : 'stall', limit)), limit) })
      const aborted = new Promise<never>((_, rej) => { o.signal?.addEventListener('abort', () => rej(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true }) })
      aborted.catch(() => {})
      const next = it.next()
      next.catch(() => {}) // a late rejection after we gave up must not become unhandled
      let r: IteratorResult<StreamChunk>
      try { r = await Promise.race([next, timeout, aborted]) } finally { clearTimeout(timer) }
      if (r.done) return
      first = false
      yield r.value
    }
  } finally {
    o.signal?.removeEventListener('abort', onAbort)
    ctl.abort()
    try { void it.return?.(undefined) } catch { /* ignore */ }
  }
}

/* ── engine ────────────────────────────────────────────────────────────────────────────────────────────── */
export interface ResumeSeed { path: string; op: FileOpKind; partial: string }

export interface ResilientOptions {
  messages: LLMMessage[]
  /** Open one provider stream (typically `streamChat`). */
  open: (messages: LLMMessage[], signal: AbortSignal) => AsyncIterable<StreamChunk>
  /** Receives every parser event (plus synthetic think events for reasoning chunks and stitched `file-end`s). */
  handle: (ev: ParserEvent) => Promise<void> | void
  signal?: AbortSignal
  isLocked?: (path: string) => boolean
  /** Paths already persisted this turn (told to the model so it never rewrites them). */
  getSaved?: () => string[]
  onStatus?: (s: StreamStatus) => void
  stallMs?: number
  ttftMs?: number
  maxContinuations?: number
  backoffMs?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Resume a previously interrupted file instead of starting a fresh turn. `partial: ''` ⇒ retry that file from scratch. */
  seed?: ResumeSeed
}

export interface ResilientResult {
  raw: string
  usage: Usage | null
  interrupted: InterruptedOp[]
  aborted: boolean
  error?: Error
  /** Total automatic continuation/retry attempts spent. */
  recoveries: number
  drafts: FileDraft[]
}

const defaultSleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  if (ms <= 0) return resolve()
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
})

interface Expect { path: string; op: FileOpKind; base: string }
interface Interruption { open?: { path: string; op: FileOpKind; content: string }; reason: InterruptReason; error?: Error; danglingTag?: string }

export async function runResilient(o: ResilientOptions): Promise<ResilientResult> {
  const max = o.maxContinuations ?? MAX_CONTINUATIONS
  const backoff = o.backoffMs ?? 700
  const sleep = o.sleep ?? defaultSleep
  const status = o.onStatus ?? (() => {})
  const drafts = new DraftTracker()
  const interrupted: InterruptedOp[] = []
  const attempts = new Map<string, number>()
  const S = { raw: '', usage: null as Usage | null, recoveries: 0, error: undefined as Error | undefined, aborted: false }

  const addUsage = (u: Usage) => { S.usage = S.usage ? { inputTokens: S.usage.inputTokens + u.inputTokens, outputTokens: S.usage.outputTokens + u.outputTokens, estimated: S.usage.estimated || u.estimated } : { ...u } }

  async function runSegment(messages: LLMMessage[], expect?: Expect): Promise<Interruption | null> {
    const parser = new ArtifactStreamParser()
    const seg = { reasoning: false, interruption: null as Interruption | null, sawExpected: false, loose: '' }

    const route = async (ev: ParserEvent) => {
      if (expect) {
        if (ev.type === 'text') { seg.loose += ev.text; return } // continuation prose is never shown; kept for the tag-less fallback
        if (ev.type === 'file-start' && ev.path === expect.path) { seg.sawExpected = true; return }
        if (ev.type === 'file-delta' && ev.path === expect.path) {
          drafts.delta(expect.path, ev.text)
          status({ phase: 'writing', path: expect.path, lines: drafts.get(expect.path)?.linesStreamed ?? 0 })
          await o.handle(ev)
          return
        }
        if (ev.type === 'file-end' && ev.path === expect.path) {
          const content = stitchContinuation(expect.base, ev.content)
          const op = expect.base ? expect.op : ev.op
          if (ev.complete) { drafts.complete(expect.path, content); await o.handle({ type: 'file-end', op, path: expect.path, content, complete: true }) }
          else seg.interruption = { open: { path: expect.path, op, content }, reason: 'truncated' }
          return
        }
      }
      if (ev.type === 'file-start') drafts.start(ev.path, ev.op)
      else if (ev.type === 'file-delta') { const d = drafts.delta(ev.path, ev.text); if (d) status({ phase: 'writing', path: d.path, lines: d.linesStreamed }) }
      else if (ev.type === 'file-end') {
        if (!ev.complete) { seg.interruption = { open: { path: ev.path, op: ev.op, content: ev.content }, reason: 'truncated' }; return }
        drafts.complete(ev.path, ev.content)
      }
      await o.handle(ev)
    }

    try {
      for await (const chunk of watchdogStream((sig) => o.open(messages, sig), { stallMs: o.stallMs, ttftMs: o.ttftMs, signal: o.signal })) {
        if (chunk.type === 'reasoning') {
          if (!seg.reasoning) { seg.reasoning = true; await route({ type: 'think-start' }) }
          await route({ type: 'think-delta', text: chunk.text })
        } else if (chunk.type === 'text') {
          if (seg.reasoning) { seg.reasoning = false; await route({ type: 'think-end' }) }
          S.raw += chunk.text
          for (const ev of parser.push(chunk.text)) await route(ev)
        } else if (chunk.type === 'usage') addUsage(chunk.usage)
      }
      if (seg.reasoning) await route({ type: 'think-end' })
      const tail = parser.flushInterrupted() // an unclosed block surfaces as file-end{complete:false}; a dangling `<creat` is dropped
      for (const ev of tail.events) await route(ev)
      if (tail.danglingTag && !seg.interruption) seg.interruption = { reason: 'truncated', danglingTag: tail.danglingTag }
      if (expect && !seg.sawExpected && !seg.interruption && seg.loose.trim()) {
        // the model answered with plain content instead of a tag: accept it as the continuation
        const content = stitchContinuation(expect.base, extractLooseContinuation(seg.loose))
        drafts.complete(expect.path, content)
        await o.handle({ type: 'file-end', op: expect.op, path: expect.path, content, complete: true })
        seg.sawExpected = true
      }
      if (expect && !seg.sawExpected && !seg.interruption) seg.interruption = { reason: 'truncated', open: expect.base ? { path: expect.path, op: expect.op, content: expect.base } : undefined }
    } catch (e) {
      if (seg.reasoning) { seg.reasoning = false; await route({ type: 'think-end' }) }
      const { events, danglingTag } = parser.flushInterrupted()
      for (const ev of events) await route(ev)
      if (isAbort(e) || o.signal?.aborted) {
        S.aborted = true
        return { reason: 'aborted', open: seg.interruption?.open, error: e as Error, danglingTag }
      }
      const reason: InterruptReason = e instanceof StreamStallError ? 'stall' : isRetryable(e) ? 'network' : 'error'
      return { reason, open: seg.interruption?.open, error: e as Error, danglingTag }
    }
    return seg.interruption
  }

  let plan: { messages: LLMMessage[]; expect?: Expect } = { messages: o.messages }
  if (o.seed) {
    const s = o.seed
    drafts.start(s.path, s.op, s.partial)
    const saved = o.getSaved?.() ?? []
    plan = s.partial.trim() && s.op !== 'patch'
      ? { messages: buildContinuationMessages(o.messages, { path: s.path, partial: s.partial, reason: 'truncated', saved }), expect: { path: s.path, op: s.op, base: s.partial } }
      : { messages: buildRetryMessages(o.messages, { path: s.path, op: s.op, reason: 'truncated', saved }), expect: { path: s.path, op: s.op, base: '' } }
  }

  for (;;) {
    const itr = await runSegment(plan.messages, plan.expect)
    if (!itr) break
    const path = itr.open?.path ?? plan.expect?.path
    const partial = itr.open?.content ?? ''
    const lines = countLines(partial)
    const key = path ?? '*'
    const n = attempts.get(key) ?? 0
    const keep = (reason: InterruptReason) => { if (itr.open) interrupted.push({ path: itr.open.path, op: itr.open.op, partialContent: partial, linesStreamed: lines, reason, attempts: n }) }
    if (itr.reason === 'aborted') { keep('aborted'); break }
    // lock enforcement during recovery: never spend tokens re-writing a file the user locked — hand the partial to the
    // caller as "complete" so applyOp reports skipped-locked (it never writes locked paths).
    if (itr.open && o.isLocked?.(itr.open.path)) {
      await o.handle({ type: 'file-end', op: itr.open.op, path: itr.open.path, content: partial, complete: true })
      break
    }
    if (itr.reason === 'error' || n >= max) {
      S.error = itr.error ?? new ProviderError('The response was cut off before it finished.')
      keep(itr.reason)
      status({ phase: 'gave-up', path: itr.open?.path, lines })
      break
    }
    attempts.set(key, n + 1)
    S.recoveries++
    status({ phase: 'stalled', path: itr.open?.path, lines: itr.open ? lines : undefined, attempt: n + 1, max, reason: itr.reason })
    await sleep(backoff * 2 ** n, o.signal)
    if (o.signal?.aborted) { S.aborted = true; keep('aborted'); break }
    const saved = o.getSaved?.() ?? []
    if (itr.open && itr.open.op !== 'patch' && lines >= MEANINGFUL_LINES) {
      plan = { messages: buildContinuationMessages(o.messages, { path: itr.open.path, partial, reason: itr.reason, saved }), expect: { path: itr.open.path, op: itr.open.op, base: partial } }
    } else {
      if (itr.open) status({ phase: 'retrying', path: itr.open.path, attempt: n + 1, max })
      plan = { messages: buildRetryMessages(o.messages, { path: itr.open?.path, op: itr.open?.op, reason: itr.reason, saved }), expect: itr.open ? { path: itr.open.path, op: itr.open.op, base: '' } : undefined }
    }
  }
  if (S.aborted) S.error = Object.assign(new ProviderError('Cancelled'), { name: 'AbortError' })
  return { raw: S.raw, usage: S.usage, interrupted, aborted: S.aborted, error: S.error, recoveries: S.recoveries, drafts: drafts.snapshot() }
}
