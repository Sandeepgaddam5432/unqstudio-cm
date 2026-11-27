import type { OpRecord } from './apply'
import { formatElapsed } from './buildSteps'

/** Minimal structural view of a chat message (keeps core/ free of store imports). */
export interface ActivityMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
  mode?: string
  parts?: { kind: 'text' | 'think' | 'op'; text?: string; opId?: string; done?: boolean }[]
  ops?: OpRecord[]
  durationMs?: number
  usage?: { inputTokens: number; outputTokens: number }
}
export type TimelineKind = 'thought' | 'read' | 'created' | 'edited' | 'deleted' | 'build' | 'question'
export interface TimelineItem { id: string; kind: TimelineKind; label: string; detail?: string; state: 'done' | 'error' | 'skipped'; path?: string }
export interface ChangeItem { id: string; path: string; verb: 'Created' | 'Modified' | 'Deleted'; added: number; removed: number; before: string; after: string }
export interface Activity { timeline: TimelineItem[]; changes: ChangeItem[]; toolCount: number; summary: string; steps: number }

const verbFor = (op: OpRecord['op']) => (op === 'create' ? 'Created' : op === 'delete' ? 'Deleted' : 'Modified')
const base = (p: string) => p.split('/').pop() || p

/**
 * Derive the chronological Timeline and per-file Changes of one assistant turn from data we already persist
 * (message parts, applied ops with before/after, duration, usage). `agentLabels` are transient agent-loop step labels (Read …).
 */
export function buildActivity(m: ActivityMsg, opts: { prevUserText?: string; buildStatus?: 'ready' | 'error' | 'building' | 'idle' | 'initializing'; agentLabels?: string[] } = {}): Activity {
  const ops = m.ops ?? []
  const byId = new Map(ops.map((o) => [o.id, o]))
  const timeline: TimelineItem[] = []
  if (m.mode === 'ask' && opts.prevUserText) timeline.push({ id: 'q', kind: 'question', label: 'Questions answered', detail: opts.prevUserText, state: 'done' })
  for (const l of opts.agentLabels ?? []) if (/^(read|searched|listed)/i.test(l)) timeline.push({ id: `r:${l}`, kind: 'read', label: l, state: 'done', path: l.replace(/^\w+\s+/, '') })
  let thoughtN = 0
  const seen = new Set<string>()
  for (const p of m.parts ?? []) {
    if (p.kind === 'think') timeline.push({ id: `t${thoughtN++}`, kind: 'thought', label: `Thought for ${formatElapsed(m.durationMs ?? 0)}`, detail: p.text, state: 'done' })
    else if (p.kind === 'op' && p.opId && byId.has(p.opId) && !seen.has(p.opId)) {
      seen.add(p.opId)
      const o = byId.get(p.opId)!
      timeline.push({ id: o.id, kind: o.op === 'create' ? 'created' : o.op === 'delete' ? 'deleted' : 'edited', label: `${o.op === 'create' ? 'Created' : o.op === 'delete' ? 'Deleted' : 'Edited'} ${base(o.path)}`, path: o.path, detail: o.detail, state: o.status === 'failed' ? 'error' : o.status === 'applied' ? 'done' : 'skipped' })
    }
  }
  for (const o of ops) if (!seen.has(o.id)) timeline.push({ id: o.id, kind: o.op === 'create' ? 'created' : o.op === 'delete' ? 'deleted' : 'edited', label: `${o.op === 'create' ? 'Created' : o.op === 'delete' ? 'Deleted' : 'Edited'} ${base(o.path)}`, path: o.path, detail: o.detail, state: o.status === 'failed' ? 'error' : o.status === 'applied' ? 'done' : 'skipped' })
  if (ops.some((o) => o.status === 'applied')) timeline.push({ id: 'build', kind: 'build', label: 'Typecheck / Build', state: opts.buildStatus === 'error' ? 'error' : 'done' })
  const changes: ChangeItem[] = ops.filter((o) => o.status === 'applied').map((o) => ({ id: o.id, path: o.path, verb: verbFor(o.op), added: o.added, removed: o.removed, before: o.before ?? '', after: o.after ?? '' }))
  const toolCount = timeline.filter((t) => t.kind !== 'thought' && t.kind !== 'question').length
  const tokens = m.usage ? m.usage.inputTokens + m.usage.outputTokens : 0
  const summary = [`Worked for ${formatElapsed(m.durationMs ?? 0)}`, `${timeline.length} step${timeline.length === 1 ? '' : 's'}`, tokens ? `${tokens.toLocaleString()} tokens` : ''].filter(Boolean).join(' · ')
  return { timeline, changes, toolCount, summary, steps: timeline.length }
}

const KW = /\b(import|export|from|const|let|var|function|return|if|else|for|while|class|extends|new|async|await|type|interface|default|as|true|false|null|undefined)\b/
/** Tiny line tokenizer for diff syntax colouring: comments, strings, keywords, numbers. */
export function tokenizeLine(line: string): { t: 'c' | 's' | 'k' | 'n' | 'p'; v: string }[] {
  const out: { t: 'c' | 's' | 'k' | 'n' | 'p'; v: string }[] = []
  const re = new RegExp(`(\\/\\/.*$)|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|(${KW.source})|(\\b\\d+(?:\\.\\d+)?\\b)`, 'g')
  let last = 0
  for (const m of line.matchAll(re)) {
    if (m.index! > last) out.push({ t: 'p', v: line.slice(last, m.index) })
    out.push({ t: m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : 'n', v: m[0] })
    last = m.index! + m[0].length
  }
  if (last < line.length) out.push({ t: 'p', v: line.slice(last) })
  return out
}
