import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { findScrollParent, insideHorizontalScroller, rubberBand, shouldDismiss, shouldEngageSheetDrag, sheetTranslate, velocityOf, type DragSample } from './sheetPhysics'

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Fill ~92% of the viewport instead of sizing to content. */
  tall?: boolean
  /** Do not dim the whole screen (used by the Visual Inspector so the preview stays visible). */
  modeless?: boolean
  label?: string
  className?: string
  /** Remove the content padding (for full-bleed layouts such as the Settings hub). */
  flush?: boolean
}

/**
 * Touch-interactive bottom sheet (<768px): drag handle + header are draggable, upward drag is rubber-banded,
 * a fast or long downward release dismisses; a downward drag from ANYWHERE on the sheet dismisses it when the inner list is at scrollTop<=0 (v3.2), backdrop blur fades with the drag, body scroll is locked,
 * Escape dismisses and the bottom padding honours the safe-area inset.
 */
export function BottomSheet({ open, onClose, title, description, children, footer, tall, modeless, label, className, flush }: BottomSheetProps) {
  const [dy, setDy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [closing, setClosing] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const samples = useRef<DragSample[]>([])
  const startY = useRef(0)

  const dismiss = useCallback(() => {
    setClosing(true)
    setDy(panel.current?.offsetHeight ?? 600)
    window.setTimeout(() => { setClosing(false); setDy(0); onClose() }, 180)
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); dismiss() } }
    window.addEventListener('keydown', key, true)
    const prev = document.body.style.overflow
    if (!modeless) document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', key, true); document.body.style.overflow = prev }
  }, [open, modeless, dismiss])

  // Full-sheet touch drag: when the inner list is at scrollTop<=0, a downward drag from ANYWHERE on the sheet moves + dismisses it.
  useEffect(() => {
    const el = panel.current
    if (!open || !el) return
    let y0 = 0, x0 = 0, base = 0, engaged = false, rejected = false, scroller: HTMLElement | null = null, skip = false
    let samp: DragSample[] = []
    const start = (e: TouchEvent) => {
      const t = e.touches[0]!
      skip = !!(e.target as Element).closest?.('[data-sheet-handle],[data-no-sheet-drag],input,textarea,[role="slider"]')
      engaged = false; rejected = false
      scroller = findScrollParent(e.target as Element, el)
      rejected = insideHorizontalScroller(e.target as Element, el)
      y0 = base = t.clientY; x0 = t.clientX; samp = [{ y: t.clientY, t: performance.now() }]
    }
    const move = (e: TouchEvent) => {
      if (skip || rejected) return
      const t = e.touches[0]!
      samp.push({ y: t.clientY, t: performance.now() })
      const top = scroller ? scroller.scrollTop : 0
      if (!engaged) {
        if (top > 0) { base = t.clientY; return }            // still scrolling the list: re-baseline until it reaches the top
        if (Math.abs(t.clientX - x0) > Math.abs(t.clientY - base) + 4 && !shouldEngageSheetDrag(0, t.clientY - base, t.clientX - x0)) return
        if (!shouldEngageSheetDrag(top, t.clientY - base, t.clientX - x0)) { if (t.clientY - base < -6) base = t.clientY; return }
        engaged = true; y0 = base; setDragging(true)
      }
      if (e.cancelable) e.preventDefault()
      setDy(sheetTranslate(t.clientY - y0))
    }
    const end = (e: TouchEvent) => {
      if (!engaged) return
      engaged = false; setDragging(false)
      const last = e.changedTouches[0]!
      const delta = last.clientY - y0
      const h = el.offsetHeight || 400
      if (shouldDismiss(delta, velocityOf(samp), h)) dismiss(); else setDy(0)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end, { passive: true })
    el.addEventListener('touchcancel', end, { passive: true })
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end) }
  }, [open, dismiss])

  if (!open) return null

  const down = (e: React.PointerEvent) => {
    startY.current = e.clientY
    samples.current = [{ y: e.clientY, t: performance.now() }]
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (!dragging) return
    samples.current.push({ y: e.clientY, t: performance.now() })
    setDy(rubberBand(e.clientY - startY.current))
  }
  const up = (e: React.PointerEvent) => {
    if (!dragging) return
    setDragging(false)
    const delta = e.clientY - startY.current
    const h = panel.current?.offsetHeight || 400
    if (shouldDismiss(delta, velocityOf(samples.current), h)) dismiss(); else setDy(0)
  }
  const h = panel.current?.offsetHeight || 500
  const fade = closing ? 0 : Math.max(0, 1 - Math.max(0, dy) / h)

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col justify-end" role="dialog" aria-modal={!modeless} aria-label={label ?? (typeof title === 'string' ? title : 'Sheet')} data-bottom-sheet style={modeless ? { pointerEvents: 'none' } : undefined}>
      {!modeless && <div data-sheet-backdrop className="absolute inset-0 bg-black/35 backdrop-blur-[3px] transition-opacity duration-150" style={{ opacity: fade }} onClick={dismiss} />}
      <div
        ref={panel}
        data-sheet-panel
        style={{ transform: `translateY(${dy}px)`, transition: dragging ? 'none' : 'transform 220ms cubic-bezier(.32,.72,0,1)', pointerEvents: 'auto' }}
        className={cn('animate-sheet relative flex min-h-0 flex-col overflow-hidden glass-sheet rounded-t-3xl', modeless ? 'max-h-[46dvh]' : tall ? 'h-[92dvh]' : 'max-h-[88dvh]', className)}
      >
        <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-sheet-handle style={{ touchAction: 'none' }} className="shrink-0 cursor-grab select-none active:cursor-grabbing">
          <div className="flex h-6 items-center justify-center"><span className="h-1.5 w-10 rounded-full bg-line-strong" /></div>
          {(title || description) && (
            <div className="flex items-start justify-between gap-3 px-5 pb-3">
              <div className="min-w-0">
                {title && <h2 className="truncate text-[16px] font-semibold tracking-tight">{title}</h2>}
                {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
              </div>
              <button onPointerDown={(e) => e.stopPropagation()} onClick={dismiss} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-muted active:scale-95"><X size={16} /></button>
            </div>
          )}
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain sheet-scroll', flush ? '' : 'px-5 pb-4')}>{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        <div className="shrink-0" style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
    </div>,
    document.body,
  )
}
