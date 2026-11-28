import { useState } from 'react'
import { AlertCircle, PlayCircle, ListChecks, Check, ChevronRight, FilePlus2, FileX2, GitFork, Lock, Pencil, RefreshCw, Rewind, Sparkles, Wrench, X } from 'lucide-react'
import { Badge, Button, Spinner, Tooltip } from '@/ui/primitives'
import { AssistantText } from './MessageBubble'
import { useChat, type ChatMessage } from '@/store/chat'
import { useWorkspace } from '@/store/workspace'
import { useApp } from '@/store/app'
import { formatCost, formatTokens } from '@/core/ai/tokens'
import type { OpRecord } from '@/core/ai/apply'
import { cn } from '@/lib/cn'
import { useChatPrefs } from '@/store/chatPrefs'
import { useSettings } from '@/store/settings'
import { haptic } from '@/lib/haptics'
import { BuildActivityCard } from './BuildActivityCard'
import { VersionCard } from './VersionCard'

function ThinkBlock({ text, done }: { text: string; done?: boolean }) {
  const auto = useChatPrefs((p) => p.autoExpandThink)
  const [manual, setManual] = useState<boolean | null>(null)
  const open = manual ?? auto
  const setOpen = (v: boolean) => setManual(v)
  return (
    <div className="my-1.5" data-think-block>
      <button onClick={() => setOpen(!open)} className="press flex min-h-[28px] items-center gap-1.5 text-left text-[12.5px] text-fg-tertiary hover:text-fg-secondary" aria-expanded={open}>
        <ChevronRight size={13} className={cn('transition-transform duration-200', open && 'rotate-90')} />
        {done ? <><Sparkles size={12} />Thought</> : <><Spinner size={12} />Thinking…</>}
      </button>
      {open && <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap border-l-2 border-line pl-3 font-mono text-[11.5px] leading-relaxed text-fg-tertiary">{text || '…'}</pre>}
    </div>
  )
}

const opIcon = { create: <FilePlus2 size={14} />, update: <Pencil size={14} />, patch: <Wrench size={14} />, delete: <FileX2 size={14} /> }
const opVerb = { create: 'Create', update: 'Rewrite', patch: 'Patch', delete: 'Delete' }

function OpCard({ op, msgId }: { op: OpRecord; msgId: string }) {
  const { approveOps, rejectOps } = useChat()
  const vfs = useWorkspace((s) => s.vfs)
  const open = () => {
    const ws = useWorkspace.getState()
    if (op.before !== undefined || op.after !== undefined) ws.showDiff({ path: op.path, before: op.before ?? '', after: op.after ?? '', label: `${opVerb[op.op]} by AI`, existed: op.before !== undefined })
    else ws.openFile(op.path)
    ws.openFile(op.path)
    useApp.getState().setMode('code')
  }
  const exists = vfs?.has(op.path)
  return (
    <div className={cn('my-1.5 flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs', op.status === 'failed' ? 'border-danger/30 bg-danger/5' : op.status === 'skipped-locked' || op.status === 'interrupted' ? 'border-warn/30 bg-warn/5' : 'border-line bg-panel')}>
      <span className="mt-0.5 text-muted">{opIcon[op.op]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{opVerb[op.op]}</span>
          <button onClick={exists || op.status === 'applied' ? open : undefined} className="min-w-0 max-w-full truncate font-mono text-[11px] text-muted hover:text-fg" title={op.path}>{op.path}</button>
          {op.status === 'streaming' && <span className="flex items-center gap-1 text-muted"><Spinner size={11} />{op.lines ?? 0} lines</span>}
          {op.status === 'applied' && <><Check size={12} className="text-success" />{op.op !== 'delete' && <span className="font-mono text-[11px]"><span className="text-success">+{op.added}</span> <span className="text-danger">−{op.removed}</span></span>}{op.detail && <span className="text-faint">{op.detail}</span>}</>}
          {op.status === 'pending' && <Badge tone="warn">awaiting approval</Badge>}
          {op.status === 'skipped-locked' && <Badge tone="warn"><Lock size={10} />locked – skipped</Badge>}
          {op.status === 'rejected' && <Badge>rejected</Badge>}
          {op.status === 'failed' && <Badge tone="danger">failed</Badge>}
          {op.status === 'interrupted' && <Badge tone="warn"><span className="tabular-nums">interrupted · line {op.lines ?? 0}</span></Badge>}
        </div>
        {(op.status === 'failed' || op.status === 'skipped-locked' || op.status === 'interrupted') && op.detail && <p className={cn('mt-1 leading-relaxed', op.status === 'failed' ? 'text-danger' : 'text-warn')}>{op.detail}</p>}
        {op.status === 'pending' && (
          <div className="mt-2 flex gap-1.5">
            <Button size="xs" variant="primary" onClick={() => approveOps(msgId, [op.id])}><Check size={11} />Apply</Button>
            <Button size="xs" onClick={() => rejectOps(msgId, [op.id])}><X size={11} />Reject</Button>
          </div>
        )}
      </div>
      {op.status === 'applied' && op.op !== 'delete' && <Button size="xs" variant="ghost" onClick={open}>Diff</Button>}
    </div>
  )
}


/** v3.4 partial-salvage card: completed files are already saved; the cut-off file is resumable in one tap. */
function RecoveryCard({ m }: { m: ChatMessage }) {
  const { recover, busy } = useChat()
  const ops = m.ops ?? []
  const cut = ops.filter((o) => o.status === 'interrupted' && o.op !== 'delete')
  if (!cut.length || m.streaming) return null
  const files = ops.filter((o) => o.op !== 'delete')
  const saved = files.filter((o) => o.status === 'applied' || o.status === 'pending').length
  return (
    <div data-recovery-card role="group" aria-label="Recover interrupted file" className="my-2 min-w-0 rounded-2xl border border-warn/35 bg-warn/5 p-3 text-xs">
      <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 font-medium text-fg-primary"><AlertCircle size={13} className="shrink-0 text-warn" /><span className="tabular-nums">{saved}/{files.length} files saved</span><span className="text-muted">·</span><span className="min-w-0 truncate font-mono text-[11px] text-muted" title={cut[0].path}>{cut[0].path} interrupted at line <span className="tabular-nums">{cut[0].lines ?? 0}</span></span></p>
      <p className="mt-1 leading-relaxed text-muted">Nothing was lost — everything streamed so far is kept. Resume continues from the next line; “Retry failed file only” rewrites just that file.</p>
      <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
        {cut.map((o) => (
          <span key={o.id} className="flex min-w-0 flex-wrap gap-1.5">
            <Button size="xs" variant="primary" disabled={busy} onClick={() => void recover(m.id, o.id, 'resume')} className="max-w-full"><PlayCircle size={11} /><span className="truncate">Resume {o.path}</span></Button>
            <Button size="xs" disabled={busy} onClick={() => void recover(m.id, o.id, 'retry')}><RefreshCw size={11} />Retry failed file only</Button>
          </span>
        ))}
      </div>
    </div>
  )
}

function UsedToolsRow({ m }: { m: ChatMessage }) {
  const n = (m.ops ?? []).filter((o) => o.status !== 'skipped-locked').length + 1
  return (
    <button data-used-tools onClick={() => useApp.getState().openActivity(m.id, 'timeline')} className="press my-1 flex min-h-[32px] items-center gap-1 rounded-full text-[13px] text-fg-tertiary hover:text-fg-primary">
      Used {n} tool{n === 1 ? '' : 's'}<ChevronRight size={14} />
    </button>
  )
}

export function MessageView({ m, isLast }: { m: ChatMessage; isLast: boolean }) {
  const { retry, undoTurn, forkAt, approveOps, rejectOps, send, busy } = useChat()
  const agentSteps = useChat((s) => (s.agent?.originId === m.id ? s.agent.steps : undefined))
  const showBadges = useChatPrefs((p) => p.showBadges)
  const showActivity = useChatPrefs((p) => p.showActivity)
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="min-w-0 max-w-[88%] rounded-[24px] rounded-br-[4px] bg-secondary px-4 py-3 text-[1em] shadow-xs-surface">
          {m.images && m.images.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{m.images.map((s, i) => <img key={i} src={s} alt="Attachment" className="h-16 w-16 rounded-lg border border-line object-cover" />)}</div>}
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.text}</p>
          {m.mode !== 'build' && <Badge className="mt-1.5">{m.mode} mode</Badge>}
        </div>
      </div>
    )
  }
  const ops = m.ops ?? []
  const pending = ops.filter((o) => o.status === 'pending')
  const opById = new Map(ops.map((o) => [o.id, o]))
  const showFooter = !m.streaming
  return (
    <div className="group t-prose min-w-0 max-w-[788px]">
      <div className="mb-1 flex min-w-0 items-center gap-2 text-[11px] text-faint">
        <span aria-hidden data-brand-mark className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg-primary/80 ring-2 ring-fg-primary/10" />
        <span className="font-medium tracking-tight text-fg-secondary">UnQStudio</span>
        {m.model && <span className="truncate text-fg-quaternary">· {m.model.split('/').pop()}</span>}
        {m.mode !== 'build' && <Badge tone="accent">{m.mode}</Badge>}
      </div>
      {(m.streaming || ops.length > 0) && <BuildActivityCard m={m} agent={agentSteps} />}
      {!m.streaming && ops.length > 0 && <UsedToolsRow m={m} />}
      {m.parts?.map((p, i) =>
        p.kind === 'text' ? <AssistantText key={i} text={p.text ?? ''} streaming={m.streaming && i === (m.parts?.length ?? 0) - 1} />
        : p.kind === 'think' ? <ThinkBlock key={i} text={p.text ?? ''} done={p.done} />
        : showActivity && opById.get(p.opId!) ? <OpCard key={i} op={opById.get(p.opId!)!} msgId={m.id} /> : null,
      )}
      {m.streaming && m.liveStatus && <div data-live-status role="status" aria-live="polite" className={cn('flex min-w-0 items-center gap-2 py-1 text-xs tabular-nums', /stalled|cut off|dropped|Retrying/.test(m.liveStatus) ? 'text-warn' : 'text-muted')}><Spinner size={12} /><span className="min-w-0 truncate">{m.liveStatus}</span></div>}
      {m.streaming && !m.liveStatus && !m.parts?.length && <div className="flex items-center gap-2 py-1 text-xs text-muted"><Spinner size={12} />Working…</div>}
      {m.streaming && !!m.parts?.length && <span className="inline-block h-3.5 w-1.5 animate-pulse-soft rounded-sm bg-accent align-middle" />}
      {m.error && (
        <div className="my-2 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-xs">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-danger" />
          <div><p className="text-danger">{m.error.message}</p>{m.error.hint && <p className="mt-0.5 text-muted">{m.error.hint}</p>}</div>
        </div>
      )}
      <RecoveryCard m={m} />
      {pending.length > 0 && (
        <div className="my-2 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-xs">
          <span className="flex-1">{pending.length} change{pending.length > 1 ? 's' : ''} waiting in the approval tray.</span>
          <Button size="xs" variant="primary" onClick={() => approveOps(m.id)}>Apply all</Button>
          <Button size="xs" onClick={() => rejectOps(m.id)}>Reject all</Button>
        </div>
      )}
      {m.undone && <p className="my-1 text-[11px] text-warn">↩ This turn was undone. Use Redo in the top bar to re-apply it.</p>}
      {showFooter && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-faint">
          {showBadges && m.usage && <span className="mr-1 font-mono">{formatTokens(m.usage.inputTokens)}↑ {formatTokens(m.usage.outputTokens)}↓{m.usage.estimated ? '~' : ''} · {formatCost(m.cost ?? null)}{m.durationMs ? ` · ${(m.durationMs / 1000).toFixed(1)}s` : ''}</span>}
          {m.checkpointBefore && !m.undone && ops.some((o) => o.status === 'applied') && <Tooltip label="Restore the project to before this request"><Button size="xs" variant="ghost" onClick={() => undoTurn(m.id)}><Rewind size={11} />Undo turn</Button></Tooltip>}
          <Tooltip label="Fork the project and chat from here"><Button size="xs" variant="ghost" onClick={() => forkAt(m.id)}><GitFork size={11} />Fork</Button></Tooltip>
          {isLast && !busy && <Button size="xs" variant="ghost" onClick={() => retry(m.id)}><RefreshCw size={11} />Retry</Button>}
        </div>
      )}
      <VersionCard m={m} />
      {m.mode === 'plan' && isLast && showFooter && !m.error && m.text.trim() && (
        <div data-plan-card className="mt-2 rounded-2xl border border-accent/30 bg-accent/5 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent"><ListChecks size={12} />Plan ready for approval</p>
          <Button variant="accent" size="sm" className="min-h-[44px] w-full" disabled={busy} onClick={() => { useSettings.getState().set({ aiMode: 'build' }); haptic('send'); void send({ text: 'Implement the plan above exactly. Build every file now.', mode: 'build' }) }}><Sparkles size={14} />Implement the plan</Button>
        </div>
      )}
    </div>
  )
}
