import { useEffect, useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import { Badge, Button } from '@/ui/primitives'
import type { Template } from '@/templates/types'
import type { ShowcaseItem } from '@/templates/showcase'
import { PREVIEW_VIEWPORT, templatePreviewHtml } from './templatePreview'
import { cn } from '@/lib/cn'

type State = 'idle' | 'loading' | 'ready' | 'error'

/**
 * REAL miniature of the template: a sandboxed `srcDoc` iframe laid out at 1280×800 and scaled with CSS `transform: scale()`.
 * Compiles lazily (IntersectionObserver) and never receives pointer events unless `interactive` (the Preview modal).
 */
export function TemplatePreviewFrame({ template, interactive, className }: { template: Template; interactive?: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<State>('idle')
  const [html, setHtml] = useState<string | null>(null)
  const [scale, setScale] = useState(0.25)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setScale(el.clientWidth / PREVIEW_VIEWPORT.w || 0.25)
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return () => ro?.disconnect() }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() } }, { rootMargin: '240px' })
    io.observe(el)
    return () => { io.disconnect(); ro?.disconnect() }
  }, [])

  useEffect(() => {
    if (!seen) return
    let live = true
    setState('loading')
    void templatePreviewHtml(template).then((h) => { if (!live) return; setHtml(h); setState(h ? 'ready' : 'error') })
    return () => { live = false }
  }, [seen, template])

  return (
    <div ref={box} data-template-thumb={state} className={cn('relative overflow-hidden bg-subtle', className)} style={{ aspectRatio: `${PREVIEW_VIEWPORT.w} / ${PREVIEW_VIEWPORT.h}` }}>
      {state === 'ready' && html && (
        <iframe
          data-template-iframe title={`${template.name} live preview`} srcDoc={html} sandbox="allow-scripts" scrolling={interactive ? 'yes' : 'no'} loading="lazy"
          tabIndex={interactive ? 0 : -1} aria-hidden={interactive ? undefined : true}
          style={{ width: PREVIEW_VIEWPORT.w, height: PREVIEW_VIEWPORT.h, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: interactive ? 'auto' : 'none', background: '#fff' }}
        />
      )}
      {(state === 'idle' || state === 'loading') && <div className="skel absolute inset-0 rounded-none" aria-hidden="true" />}
      {state === 'error' && <div className="absolute inset-0 flex items-center justify-center text-[11px] text-fg-tertiary">Preview unavailable offline</div>}
    </div>
  )
}

/** Home "Templates & Showcase" card: live miniature + name + Preview / Remix. */
export function TemplateCard({ item, busy, onPreview, onRemix }: { item: ShowcaseItem; busy: boolean; onPreview: () => void; onRemix: () => void }) {
  return (
    <div data-showcase-card={item.category} className="glass flex flex-col overflow-hidden rounded-3xl">
      <TemplatePreviewFrame template={item.template} className="w-full border-b border-line" />
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2"><h3 className="truncate text-sm font-semibold">{item.template.name}</h3><Badge>{item.category}</Badge></div>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{item.template.description}</p>
        </div>
        <div className="mt-auto flex gap-2">
          <Button size="sm" className="min-h-[40px] flex-1" onClick={onPreview}><Eye size={13} />Preview</Button>
          <Button size="sm" variant="accent" className="min-h-[40px] flex-1" onClick={onRemix} disabled={busy}>Remix</Button>
        </div>
      </div>
    </div>
  )
}
