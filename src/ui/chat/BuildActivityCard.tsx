import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronRight, Circle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { deriveSteps, formatElapsed, type BuildStep } from '@/core/ai/buildSteps'
import { usePreview } from '@/store/preview'
import { useChat, type ChatMessage } from '@/store/chat'
import { openOpDiff } from './openDiff'

/** Lovable-style collapsible status card: shimmer while generating, live "Thought for Ns", step list with clickable file rows. */
export function BuildActivityCard({ m, agent }: { m: ChatMessage; agent?: BuildStep[] }) {
  const previewStatus = usePreview((s) => s.status)
  const healing = useChat((s) => s.heal?.originId === m.id || (s.heal != null && m.streaming === true))
  const [now, setNow] = useState(() => Date.now())
  const [manual, setManual] = useState<boolean | null>(null)
  const live = !!m.streaming
  useEffect(() => { if (!live) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [live])
  const ops = m.ops ?? []
  const steps = useMemo(() => deriveSteps({ ops, streaming: live, previewStatus, healing, agent }), [ops, live, previewStatus, healing, agent])
  const elapsed = live ? now - m.createdAt : m.durationMs ?? 0
  const open = manual ?? live
  const failed = ops.some((o) => o.status === 'failed')
  const was = useRef(live)
  useEffect(() => { if (was.current && !live) haptic(failed || m.error ? 'error' : ops.some((o) => o.status === 'applied') ? 'success' : 'tap'); was.current = live }, [live])
  if (!live && !ops.length) return null
  const byPath = new Map(ops.map((o) => [o.path, o]))
  return (
    <div data-build-card data-live={live} className={cn('relative my-2 overflow-hidden rounded-2xl border bg-panel', live ? 'border-accent/30' : 'border-line')}>
      {live && <div aria-hidden className="shimmer pointer-events-none absolute inset-x-0 top-0 h-0.5" />}
      <button onClick={() => setManual(!open)} aria-expanded={open} className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-[13px] font-medium">
        <ChevronRight size={14} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-90')} />
        <span className={cn('min-w-0 flex-1 truncate', live && 'text-fg')}>{live ? `Thinking… ${formatElapsed(elapsed)}` : `Thought for ${formatElapsed(elapsed)}`}</span>
        <span className="shrink-0 text-[11px] text-faint">{steps.filter((s) => s.state === 'done').length}/{steps.length} steps</span>
      </button>
      {open && (
        <ol className="space-y-0.5 border-t border-line px-3 py-2" aria-label="Build steps">
          {steps.map((s) => {
            const op = s.path ? byPath.get(s.path) : undefined
            const clickable = !!op && s.state === 'done' && op.op !== 'delete'
            const Icon = s.state === 'done' ? <Check size={13} className="text-success" /> : s.state === 'active' ? <Loader2 size={13} className="animate-spin-fast text-accent" /> : s.state === 'error' ? <AlertTriangle size={13} className="text-danger" /> : <Circle size={11} className="text-faint" />
            return (
              <li key={s.id} data-step={s.state} className="flex min-h-[28px] items-center gap-2 text-[12px]">
                <span className="flex w-4 shrink-0 justify-center">{Icon}</span>
                {clickable ? <button onClick={() => openOpDiff(op!)} className="min-w-0 truncate text-left font-mono text-[11.5px] text-muted underline-offset-2 hover:text-fg hover:underline" title="Open diff">{s.label}</button> : <span className={cn('min-w-0 truncate', s.state === 'active' ? 'text-fg' : 'text-muted', s.path && 'font-mono text-[11.5px]')}>{s.label}</span>}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
