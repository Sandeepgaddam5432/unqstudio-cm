import { useState } from 'react'
import { ChevronRight, FilePlus2, FileX2, Pencil, Wrench, Wand2 } from 'lucide-react'
import { Spinner } from '@/ui/primitives'
import { Markdown } from './Markdown'
import { highlight } from './highlight'
import { parseMessageText, type ToolSeg } from './MessageParser'
import { cn } from '@/lib/cn'

const ICON = { Create: <FilePlus2 size={14} />, Rewrite: <Pencil size={14} />, Patch: <Wrench size={14} />, Delete: <FileX2 size={14} />, Tool: <Wand2 size={14} /> }

/** Collapsible inline tool card (Create / Rewrite / Patch with a Diff viewer) extracted from raw tool-call text. */
export function ToolCard({ seg }: { seg: ToolSeg }) {
  const [open, setOpen] = useState(false)
  const lines = seg.body ? seg.body.split('\n') : []
  const hasBody = seg.pairs.length > 0 || lines.length > 0
  return (
    <div data-tool-card={seg.tool} className="glass my-2 overflow-hidden rounded-2xl text-xs">
      <button onClick={() => hasBody && setOpen((o) => !o)} aria-expanded={open} className="flex min-h-[40px] w-full items-center gap-2.5 px-3 py-2 text-left">
        <span className="text-muted">{ICON[seg.tool]}</span>
        <span className="font-medium">{seg.tool === 'Patch' ? 'Patch' : seg.tool}</span>
        {seg.path && <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted" title={seg.path}>{seg.path}</span>}
        {!seg.path && <span className="flex-1" />}
        {!seg.done && <span className="flex items-center gap-1 text-muted"><Spinner size={11} />working</span>}
        {seg.tool === 'Patch' && seg.pairs.length > 0 && <span className="text-fg-tertiary">{seg.pairs.length} change{seg.pairs.length === 1 ? '' : 's'}</span>}
        {hasBody && <ChevronRight size={13} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-90')} />}
      </button>
      {open && (
        <div className="max-h-72 overflow-auto border-t border-line bg-subtle/50 p-2 font-mono text-[11px] leading-relaxed" data-tool-diff>
          {seg.pairs.map((p, i) => (
            <div key={i} className="mb-2 overflow-hidden rounded-lg border border-line last:mb-0">
              {p.search.split('\n').map((l, j) => <div key={`s${j}`} className="whitespace-pre-wrap bg-danger/8 px-2 text-danger [overflow-wrap:anywhere]">− {l}</div>)}
              {p.replace.split('\n').map((l, j) => <div key={`r${j}`} className="whitespace-pre-wrap bg-success/8 px-2 text-success [overflow-wrap:anywhere]">+ {l}</div>)}
            </div>
          ))}
          {seg.pairs.length === 0 && <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{highlight(lines.slice(0, 80).join('\n'), seg.path?.split('.').pop()).map((t, i) => <span key={i} className={`tok-${t.t}`}>{t.v}</span>)}{lines.length > 80 ? '\n…' : ''}</pre>}
        </div>
      )}
    </div>
  )
}

/** Assistant text → clean GitHub-flavoured Markdown prose + inline tool cards. Raw tool-call / diff markers never reach the DOM. */
export function AssistantText({ text, streaming }: { text: string; streaming?: boolean }) {
  const segs = parseMessageText(text, streaming)
  return (
    <>
      {segs.map((s, i) => (s.kind === 'prose' ? <Markdown key={i} text={s.text} /> : <ToolCard key={i} seg={s} />))}
    </>
  )
}
