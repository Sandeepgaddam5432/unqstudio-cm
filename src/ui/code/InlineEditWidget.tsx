import { useEffect, useRef, useState } from 'react'
import { Check, CornerDownLeft, Sparkles, X } from 'lucide-react'
import { Button, Spinner } from '@/ui/primitives'
import { activeConfig } from '@/store/aiConfig'
import { streamChat } from '@/core/ai/stream'
import { buildInlineMessages, diffPreview, extractReplacement } from '@/core/ai/inlineEdit'
import { cn } from '@/lib/cn'

export interface InlineEditTarget { from: number; to: number; text: string; startLine: number; endLine: number; before: string; after: string; left: number; top: number }

/** Floating Cursor-style prompt: instruction → streamed surgical replacement → inline green/red diff → Accept / Reject. */
export function InlineEditWidget({ path, target, onAccept, onClose }: { path: string; target: InlineEditTarget; onAccept: (replacement: string) => void; onClose: () => void }) {
  const [instruction, setInstruction] = useState('')
  const [phase, setPhase] = useState<'input' | 'streaming' | 'preview' | 'error'>('input')
  const [partial, setPartial] = useState('')
  const [replacement, setReplacement] = useState('')
  const [error, setError] = useState('')
  const ctl = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); return () => ctl.current?.abort() }, [])

  const run = async () => {
    if (!instruction.trim() || phase === 'streaming') return
    const cfg = activeConfig()
    if (!cfg.provider || cfg.error) { setError(cfg.error === 'locked' ? 'Unlock your key vault first.' : 'Connect a model first (Settings → Providers Hub).'); setPhase('error'); return }
    ctl.current = new AbortController()
    setPhase('streaming'); setPartial(''); setError('')
    try {
      let acc = ''
      for await (const c of streamChat({ provider: cfg.provider, model: cfg.model, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, temperature: 0.2, signal: ctl.current.signal, messages: buildInlineMessages({ path, before: target.before, selected: target.text, after: target.after, instruction }) })) {
        if (c.type === 'text') { acc += c.text; setPartial(acc) }
      }
      const r = extractReplacement(acc)
      if (!r.trim()) throw new Error('The model returned an empty replacement.')
      setReplacement(r); setPhase('preview')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message || String(e)); setPhase('error')
    }
  }

  const lines = phase === 'preview' ? diffPreview(target.text, replacement) : []
  return (
    <div role="dialog" aria-label="Inline AI edit" data-inline-edit style={{ left: target.left, top: target.top }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
      className="absolute z-20 w-[min(30rem,calc(100%-1rem))] animate-fade rounded-xl border border-line-strong bg-panel p-2 shadow-pop">
      <div className="flex items-center gap-1.5">
        <Sparkles size={13} className="shrink-0 text-accent" />
        <input ref={input} value={instruction} onChange={(e) => setInstruction(e.target.value)} disabled={phase === 'streaming'} placeholder={`Edit lines ${target.startLine}–${target.endLine}… e.g. add loading skeleton & aria labels`} aria-label="Edit instruction"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run() } }} className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint" />
        {phase === 'streaming' ? <Spinner size={13} /> : <Button size="icon-sm" variant="ghost" aria-label="Run edit" onClick={() => void run()} disabled={!instruction.trim()}><CornerDownLeft size={13} /></Button>}
        <Button size="icon-sm" variant="ghost" aria-label="Close inline edit" onClick={onClose}><X size={13} /></Button>
      </div>
      {phase === 'streaming' && <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-subtle p-2 font-mono text-[11px] leading-snug text-muted">{partial || 'Thinking…'}</pre>}
      {phase === 'error' && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      {phase === 'preview' && (
        <>
          <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-line font-mono text-[11px] leading-snug" data-inline-diff>
            {lines.map((l, i) => (
              <div key={i} data-diff={l.type} className={cn('whitespace-pre-wrap px-2 py-px', l.type === 'add' && 'bg-success/15 text-success', l.type === 'del' && 'bg-danger/10 text-danger line-through decoration-danger/40', l.type === 'same' && 'text-muted')}>{l.type === 'add' ? '+ ' : l.type === 'del' ? '− ' : '  '}{l.text}</div>
            ))}
          </div>
          <div className="mt-2 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={onClose} data-testid="inline-reject"><X size={12} />Reject</Button>
            <Button size="sm" variant="primary" onClick={() => onAccept(replacement)} data-testid="inline-accept"><Check size={12} />Accept</Button>
          </div>
        </>
      )}
    </div>
  )
}
