import { uid } from '@/lib/util'
import type { VirtualFileSystem } from '@/core/vfs/vfs'
import type { AIMode } from '@/store/settings'
import { applyOp, type OpRecord } from './apply'
import { type ParserEvent } from './parser'
import type { ProviderDef } from './providers'
import { completeOnce, listModels, streamChat } from './stream'
import { runResilient, type InterruptedOp, type StreamStatus } from './resilientStream'
import { normalizePath } from '@/core/vfs/vfs'
import { estimateMessagesTokens, estimateTokens } from './tokens'
import { buildProjectContext, extractMentions, systemInstructions, ENHANCER_SYSTEM } from './prompts'
import type { ContentPart, LLMMessage, Usage } from './types'

export interface HistoryItem { role: 'user' | 'assistant'; text: string; summary?: string }

export type TurnEvent =
  | { type: 'text'; text: string }
  | { type: 'think-start' }
  | { type: 'think-delta'; text: string }
  | { type: 'think-end' }
  | { type: 'op'; op: OpRecord }
  | { type: 'op-progress'; id: string; lines: number }
  | { type: 'usage'; usage: Usage }
  | { type: 'checkpoint-before'; id: string }
  | { type: 'status'; status: StreamStatus }

export interface TurnInput {
  vfs: VirtualFileSystem
  provider: ProviderDef
  model: string
  apiKey?: string
  baseUrl?: string
  mode: AIMode
  history: HistoryItem[]
  userText: string
  images?: string[]
  pinned?: string[]
  customPrompts?: string[]
  requireApproval?: boolean
  autoCheckpoint?: boolean
  includeAllFiles?: boolean
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  onEvent?: (e: TurnEvent) => void
  /** v3.4: resume/retry ONE interrupted file instead of running a fresh turn (`partial: ''` = retry from scratch). */
  resume?: { opId: string; path: string; op: 'create' | 'update' | 'patch'; partial: string }
  /** v3.4 resilience tuning (defaults: 28 s stall, 120 s first-token, 2 continuations, 700 ms back-off). */
  resilience?: { stallMs?: number; ttftMs?: number; maxContinuations?: number; backoffMs?: number; sleep?: (ms: number, signal?: AbortSignal) => Promise<void> }
}

export interface TurnResult {
  raw: string
  ops: OpRecord[]
  usage: Usage
  checkpointBefore?: string
  checkpointAfter?: string
  appliedCount: number
  /** v3.4: files cut off mid-stream that automatic recovery could not finish (partial content preserved on the OpRecord). */
  interrupted: InterruptedOp[]
  /** Set when the turn ended early (stall/network/limit/abort) — completed files are still applied and returned in `ops`. */
  error?: Error
  aborted?: boolean
  /** Automatic continuation/retry attempts spent. */
  recoveries: number
}

export function buildMessages(input: Pick<TurnInput, 'vfs' | 'mode' | 'history' | 'userText' | 'images' | 'pinned' | 'customPrompts' | 'includeAllFiles'>): { messages: LLMMessage[]; contextTokens: number } {
  const mentioned = extractMentions(input.userText, input.vfs.paths())
  const ctx = buildProjectContext(input.vfs, { pinned: input.pinned, mentioned, includeAll: input.includeAllFiles })
  const system = `${systemInstructions(input.mode, input.customPrompts)}\n\n${ctx.text}`
  const messages: LLMMessage[] = [{ role: 'system', content: system }]
  for (const h of input.history.slice(-20)) messages.push({ role: h.role, content: h.role === 'assistant' && h.summary ? `${h.text}\n\n${h.summary}`.trim() : h.text })
  const parts: ContentPart[] = [{ type: 'text', text: input.userText }]
  for (const img of input.images ?? []) parts.push({ type: 'image', dataUrl: img })
  messages.push({ role: 'user', content: parts.length === 1 ? input.userText : parts })
  return { messages, contextTokens: estimateTokens(system) }
}

/** Human-readable recap appended to assistant history so the model knows what really happened (applied / locked / failed). */
export function summarizeOps(ops: OpRecord[]): string {
  if (!ops.length) return ''
  const by = (s: OpRecord['status']) => ops.filter((o) => o.status === s)
  const lines: string[] = []
  if (by('applied').length) lines.push('Applied: ' + by('applied').map((o) => `${o.op} ${o.path}`).join(', '))
  if (by('skipped-locked').length) lines.push('SKIPPED because the user locked them: ' + by('skipped-locked').map((o) => o.path).join(', '))
  if (by('failed').length) lines.push('FAILED: ' + by('failed').map((o) => `${o.op} ${o.path} (${o.detail})`).join('; '))
  if (by('pending').length) lines.push('Awaiting user approval: ' + by('pending').map((o) => o.path).join(', '))
  if (by('rejected').length) lines.push('Rejected by user: ' + by('rejected').map((o) => o.path).join(', '))
  if (by('interrupted').length) lines.push('INTERRUPTED mid-file (partial content kept, the user can resume): ' + by('interrupted').map((o) => `${o.path} at line ${o.lines ?? 0}`).join(', '))
  return `[System recap of file operations — ${lines.join(' | ')}]`
}

export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const { vfs, mode } = input
  const emit = input.onEvent ?? (() => {})
  const { messages } = buildMessages(input)
  const ops: OpRecord[] = []
  let checkpointBefore: string | undefined

  if (mode === 'build' && input.autoCheckpoint !== false && !input.resume) {
    const cp = await vfs.checkpoint(`Before: ${input.userText.replace(/\s+/g, ' ').slice(0, 48)}`, 'auto')
    checkpointBefore = cp.id
    emit({ type: 'checkpoint-before', id: cp.id })
  }

  const progress = new Map<string, { id: string; lines: number }>()
  let appliedCount = 0

  // resume / retry of ONE interrupted file: re-open its record so the UI card updates in place
  if (input.resume) {
    const r = input.resume
    const rec: OpRecord = { id: r.opId, op: r.op, path: r.path, status: 'streaming', added: 0, removed: 0, lines: r.partial ? r.partial.split('\n').length : 0 }
    progress.set(r.path, { id: rec.id, lines: (r.partial.match(/\n/g) ?? []).length })
    ops.push(rec)
    emit({ type: 'op', op: { ...rec } })
  }

  const handle = async (ev: ParserEvent) => {
    switch (ev.type) {
      case 'text': emit({ type: 'text', text: ev.text }); break
      case 'think-start': case 'think-end': emit({ type: ev.type }); break
      case 'think-delta': emit({ type: 'think-delta', text: ev.text }); break
      case 'file-start': {
        if (mode !== 'build') break
        const existing = progress.get(ev.path)
        if (existing) { existing.lines = 0; break } // a retry re-opens the same record — never a duplicate card
        const rec: OpRecord = { id: uid('o'), op: ev.op, path: ev.path, status: 'streaming', added: 0, removed: 0 }
        progress.set(ev.path, { id: rec.id, lines: 0 })
        ops.push(rec)
        emit({ type: 'op', op: { ...rec } })
        break
      }
      case 'file-delta': {
        const p = progress.get(ev.path)
        if (!p) break
        p.lines += (ev.text.match(/\n/g) ?? []).length
        emit({ type: 'op-progress', id: p.id, lines: p.lines })
        break
      }
      case 'file-end': {
        const p = progress.get(ev.path)
        const rec = ops.find((o) => o.id === p?.id)
        if (!rec) break
        progress.delete(ev.path)
        if (!ev.complete) { rec.status = 'failed'; rec.detail = 'Response was cut off before this file was finished.' }
        else if (input.requireApproval) { rec.op = ev.op; rec.status = 'pending'; rec.content = ev.content; rec.lines = ev.content.split('\n').length; rec.partial = undefined }
        else {
          rec.op = ev.op
          const r = await applyOp(vfs, rec.op as 'create', rec.path, ev.content)
          Object.assign(rec, r, { lines: ev.content.split('\n').length, partial: undefined })
          if (r.status === 'applied') appliedCount++
        }
        emit({ type: 'op', op: { ...rec } })
        break
      }
      case 'delete': {
        if (mode !== 'build') break
        const rec: OpRecord = { id: uid('o'), op: 'delete', path: ev.path, status: 'pending', added: 0, removed: 0 }
        ops.push(rec)
        if (!input.requireApproval) {
          Object.assign(rec, await applyOp(vfs, 'delete', ev.path))
          if (rec.status === 'applied') appliedCount++
        }
        emit({ type: 'op', op: { ...rec } })
        break
      }
    }
  }

  const r = input.resilience ?? {}
  const result = await runResilient({
    messages,
    open: (msgs, signal) => streamChat({ provider: input.provider, model: input.model, apiKey: input.apiKey, baseUrl: input.baseUrl, messages: msgs, signal, fetchImpl: input.fetchImpl }),
    handle,
    signal: input.signal,
    isLocked: (p) => vfs.isLocked(normalizePath(p)),
    getSaved: () => ops.filter((o) => o.status === 'applied' || o.status === 'pending').map((o) => o.path),
    onStatus: (status) => emit({ type: 'status', status }),
    stallMs: r.stallMs, ttftMs: r.ttftMs, maxContinuations: r.maxContinuations, backoffMs: r.backoffMs, sleep: r.sleep,
    seed: input.resume ? { path: input.resume.path, op: input.resume.op, partial: input.resume.partial } : undefined,
  })

  // Nothing salvageable and the request itself failed (bad key, HTTP 4xx, offline…) → surface it like before.
  if (result.error && !ops.length && !result.raw.trim()) throw result.error

  // Partial salvage: every cut-off file keeps what was streamed. Completed files of this turn are already persisted above.
  const total = ops.filter((o) => o.op !== 'delete').length
  for (const it of result.interrupted) {
    const rec = [...ops].reverse().find((o) => o.path === it.path && o.status === 'streaming')
    if (!rec) continue
    const saved = ops.filter((o) => o.status === 'applied' || o.status === 'pending').length
    rec.status = 'interrupted'
    rec.partial = it.partialContent
    rec.lines = it.linesStreamed
    rec.interruptedReason = it.reason
    rec.detail = it.reason === 'aborted'
      ? `Stopped at line ${it.linesStreamed} — ${saved}/${total} files saved.`
      : `${saved}/${total} files saved · ${it.path} interrupted at line ${it.linesStreamed}${it.attempts ? ` (after ${it.attempts} automatic ${it.attempts === 1 ? 'retry' : 'retries'})` : ''}.`
    emit({ type: 'op', op: { ...rec } })
  }
  for (const rec of ops) if (rec.status === 'streaming') { rec.status = 'failed'; rec.detail = 'Response ended before this file was finished.'; emit({ type: 'op', op: { ...rec } }) }
  emit({ type: 'status', status: { phase: 'idle' } })

  const finalUsage: Usage = result.usage ?? { inputTokens: estimateMessagesTokens(messages), outputTokens: estimateTokens(result.raw), estimated: true }
  emit({ type: 'usage', usage: finalUsage })

  let checkpointAfter: string | undefined
  if (appliedCount > 0) {
    const cp = await vfs.checkpoint(`AI: ${input.userText.replace(/\s+/g, ' ').slice(0, 56)}`, 'ai')
    checkpointAfter = cp.id
  }
  return { raw: result.raw, ops, usage: finalUsage, checkpointBefore, checkpointAfter, appliedCount, interrupted: result.interrupted, error: result.error, aborted: result.aborted, recoveries: result.recoveries }
}

/** Apply operations that were held in the approval tray. */
export async function applyPendingOps(vfs: VirtualFileSystem, ops: OpRecord[], label: string): Promise<{ ops: OpRecord[]; checkpointAfter?: string }> {
  let applied = 0
  const out: OpRecord[] = []
  for (const o of ops) {
    if (o.status !== 'pending') { out.push(o); continue }
    const r = await applyOp(vfs, o.op as 'create', o.path, o.content ?? '')
    if (r.status === 'applied') applied++
    out.push({ ...o, ...r, content: undefined })
  }
  const cp = applied ? await vfs.checkpoint(`AI: ${label.slice(0, 56)}`, 'ai') : undefined
  return { ops: out, checkpointAfter: cp?.id }
}

export async function enhancePrompt(args: { provider: ProviderDef; model: string; apiKey?: string; baseUrl?: string; text: string; signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<string> {
  const { text } = await completeOnce({
    provider: args.provider, model: args.model, apiKey: args.apiKey, baseUrl: args.baseUrl, signal: args.signal, fetchImpl: args.fetchImpl, temperature: 0.7, maxTokens: 900,
    messages: [{ role: 'system', content: ENHANCER_SYSTEM }, { role: 'user', content: `Improve this prompt:\n\n${args.text}` }],
  })
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/^["“]|["”]$/g, '')
}

export async function testConnection(provider: ProviderDef, apiKey: string | undefined, baseUrl?: string, fetchImpl?: typeof fetch): Promise<{ ok: boolean; ms: number; message: string; models?: string[] }> {
  const t0 = performance.now()
  try {
    const models = await listModels(provider, apiKey, baseUrl, fetchImpl)
    return { ok: true, ms: Math.round(performance.now() - t0), message: `Connected · ${models.length} models available`, models }
  } catch (e) {
    // some providers have no /models endpoint – fall back to a 1-token completion
    try {
      const model = provider.models[0]?.id
      if (!model) throw e
      await completeOnce({ provider, model, apiKey, baseUrl, maxTokens: 1, messages: [{ role: 'user', content: 'ping' }], fetchImpl })
      return { ok: true, ms: Math.round(performance.now() - t0), message: 'Connected (completion test passed)' }
    } catch (e2) {
      const err = e2 as Error & { hint?: string }
      return { ok: false, ms: Math.round(performance.now() - t0), message: `${err.message}${err.hint ? ` — ${err.hint}` : ''}` }
    }
  }
}
