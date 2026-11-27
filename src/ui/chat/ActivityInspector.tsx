import { useMemo, useState } from 'react'
import { AlertTriangle, Brain, Check, ChevronRight, Copy, Eye, FilePlus2, FilePenLine, FileSearch, FileX2, HelpCircle, Hammer } from 'lucide-react'
import { BottomSheet, Drawer, Segmented } from '@/ui/primitives'
import { useChat } from '@/store/chat'
import { usePreview } from '@/store/preview'
import { useApp } from '@/store/app'
import { useIsMobile } from '@/lib/useMedia'
import { buildActivity, tokenizeLine, type ChangeItem, type TimelineItem } from '@/core/ai/activity'
import { buildUnifiedRows } from '@/core/vfs/lineDiff'
import { openOpDiff } from './openDiff'
import { toast } from '@/store/toast'
import { cn } from '@/lib/cn'

const ICON: Record<TimelineItem['kind'], React.ReactNode> = {
  thought: <Brain size={14} />, read: <FileSearch size={14} />, created: <FilePlus2 size={14} />, edited: <FilePenLine size={14} />, deleted: <FileX2 size={14} />, build: <Hammer size={14} />, question: <HelpCircle size={14} />,
}
const TOK: Record<string, string> = { c: 'text-fg-quaternary italic', s: 'text-success', k: 'text-accent', n: 'text-warn', p: '' }

function TimelineRow({ it }: { it: TimelineItem }) {
  const [open, setOpen] = useState(false)
  const expandable = !!it.detail
  return (
    <li data-timeline-item={it.kind} className="rounded-xl bg-primary shadow-xs-surface">
      <button disabled={!expandable} onClick={() => setOpen((v) => !v)} aria-expanded={expandable ? open : undefined} className="flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left text-[13px]">
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-depth', it.state === 'error' ? 'text-danger' : 'text-fg-secondary')}>{it.state === 'error' ? <AlertTriangle size={14} /> : ICON[it.kind]}</span>
        <span className={cn('min-w-0 flex-1 truncate', it.path && 'font-mono text-[12px]')}>{it.label}</span>
        {it.state === 'done' && it.kind !== 'thought' && <Check size={13} className="shrink-0 text-success" />}
        {expandable && <ChevronRight size={14} className={cn('shrink-0 text-fg-tertiary transition-transform', open && 'rotate-90')} />}
      </button>
      {open && it.detail && <p className="t-meta whitespace-pre-wrap border-t border-line px-3 py-2.5 text-fg-secondary [overflow-wrap:anywhere]">{it.detail}</p>}
    </li>
  )
}

export function DiffLines({ before, after }: { before: string; after: string }) {
  const rows = useMemo(() => buildUnifiedRows(before, after), [before, after])
  return (
    <div data-diff className="overflow-x-auto border-t border-line bg-base font-mono text-[11.5px] leading-5">
      {rows.map((r, i) => r.skip ? (
        <div key={i} className="px-3 py-0.5 text-center text-fg-quaternary">⋯ {r.skip} unchanged lines</div>
      ) : r.cell && (
        <div key={i} data-diff-line={r.cell.type} className={cn('flex min-w-max', r.cell.type === 'add' && 'bg-success/12', r.cell.type === 'del' && 'bg-danger/12')}>
          <span className="w-9 shrink-0 select-none pr-2 text-right text-fg-quaternary">{r.cell.n}</span>
          <span className={cn('w-4 shrink-0 select-none text-center', r.cell.type === 'add' ? 'text-success' : r.cell.type === 'del' ? 'text-danger' : 'text-transparent')}>{r.cell.type === 'add' ? '+' : r.cell.type === 'del' ? '−' : ' '}</span>
          <span className="whitespace-pre pr-3">{tokenizeLine(r.cell.text).map((t, j) => <span key={j} className={TOK[t.t]}>{t.v}</span>)}</span>
        </div>
      ))}
    </div>
  )
}

function ChangeCard({ c, onView }: { c: ChangeItem; onView: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <li data-change-card={c.verb} className="overflow-hidden rounded-xl bg-primary shadow-xs-surface">
      <div className="flex min-h-[48px] items-center gap-2 px-3">
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px]">
          <ChevronRight size={14} className={cn('shrink-0 text-fg-tertiary transition-transform', open && 'rotate-90')} />
          <span className="min-w-0 truncate"><span className="font-medium">{c.verb}</span> <span className="font-mono text-[12px] text-fg-secondary">{c.path.split('/').pop()}</span></span>
          <span className="t-meta shrink-0 text-success">+{c.added}</span><span className="t-meta shrink-0 text-danger">−{c.removed}</span>
        </button>
        <button onClick={() => { void navigator.clipboard?.writeText(c.path); toast.success('Path copied', c.path) }} aria-label={`Copy path ${c.path}`} className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-tertiary hover:bg-depth"><Copy size={14} /></button>
        <button onClick={onView} className="press hidden h-8 shrink-0 items-center rounded-full bg-depth px-3 text-[12px] font-medium sm:flex">View file</button>
      </div>
      {open && (<><DiffLines before={c.before} after={c.after} /><div className="border-t border-line p-2 sm:hidden"><button onClick={onView} className="press h-9 w-full rounded-full bg-depth text-[12px] font-medium">View file</button></div></>)}
    </li>
  )
}

/** Full-height sheet (phones) / right drawer (desktop): Timeline | + Changes for one assistant turn. */
export function ActivityInspector() {
  const activity = useApp((s) => s.activity)
  const close = useApp((s) => s.closeActivity)
  const openActivity = useApp((s) => s.openActivity)
  const messages = useChat((s) => s.messages)
  const status = usePreview((s) => s.status)
  const mobile = useIsMobile()
  const idx = activity ? messages.findIndex((m) => m.id === activity.id) : -1
  const m = idx >= 0 ? messages[idx] : undefined
  const data = useMemo(() => {
    if (!m) return null
    const prev = [...messages.slice(0, idx)].reverse().find((x) => x.role === 'user')
    return buildActivity(m, { prevUserText: prev?.text, buildStatus: status })
  }, [m, messages, idx, status])
  if (!activity || !m || !data) return null
  const tab = activity.tab
  const body = (
    <div data-activity-inspector className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-line px-4 pb-3 pt-1">
        <Segmented<'timeline' | 'changes'> value={tab} onChange={(t) => openActivity(activity.id, t)} items={[{ id: 'timeline', label: 'Timeline' }, { id: 'changes', label: `+ Changes${data.changes.length ? ` (${data.changes.length})` : ''}` }]} />
        <p data-activity-summary className="t-meta text-fg-tertiary">{data.summary}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === 'timeline' ? (
          data.timeline.length ? <ol className="space-y-2" aria-label="Agent timeline">{data.timeline.map((it) => <TimelineRow key={it.id} it={it} />)}</ol> : <p className="py-8 text-center text-sm text-fg-tertiary">No recorded steps for this turn.</p>
        ) : (
          data.changes.length ? <ul className="space-y-2" aria-label="File changes">{data.changes.map((c) => <ChangeCard key={c.id} c={c} onView={() => { close(); openOpDiff({ path: c.path, op: c.verb === 'Created' ? 'create' : c.verb === 'Deleted' ? 'delete' : 'update', before: c.verb === 'Created' ? undefined : c.before, after: c.after }) }} />)}</ul> : <p className="py-8 text-center text-sm text-fg-tertiary">No files changed in this turn.</p>
        )}
      </div>
      <div className="shrink-0 border-t border-line p-3 text-center"><button onClick={() => { close(); useApp.getState().requestTab('preview') }} className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-depth px-4 text-[13px] font-medium"><Eye size={14} />Preview</button></div>
    </div>
  )
  return mobile
    ? <BottomSheet open onClose={close} title="Activity" tall flush>{body}</BottomSheet>
    : <Drawer open onClose={close} title="Activity">{body}</Drawer>
}
