import { Children, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { insideHorizontalScroller } from './sheetPhysics'
import { settleIndex, swipeAxis, edgeResist } from './pagerPhysics'

export const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)'
export const SPRING_MS = 300

export interface SwipePagerProps {
  /** Committed pane index (controlled). */
  index: number
  /** Called once a swipe settles on a different pane. */
  onIndexChange: (i: number) => void
  /** Fractional position (0..count-1) while dragging; `dragging=false` fires on release / index change with the target index. */
  onProgress?: (position: number, dragging: boolean) => void
  /** One child per pane. */
  children: ReactNode
  className?: string
  /** data-attribute name stamped on each pane with its key, e.g. `data-shell-pane`. */
  paneAttr?: string
  paneKeys?: string[]
  paneLabels?: string[]
  /** Extra attributes for the clipped viewport (e2e hooks). */
  rootProps?: Record<string, string | number | undefined>
}

/**
 * Lovable-grade horizontal pager (v3.3): a clipped viewport (`overflow:hidden`) holding one GPU-accelerated flex track.
 * Each pane is exactly one viewport wide (`flex: 0 0 100%`, `contain: layout paint`), so a pane's header / FAB / fixed children can never bleed
 * into its neighbour. The finger is tracked 1:1 with `translate3d`; on release the track springs (cubic-bezier(.22,1,.36,1), 300ms) to the
 * nearest pane using distance + velocity. Only `transform` animates. Inactive panes are `visibility:hidden` + `inert` at rest (no duplicate
 * headers in hit-testing / a11y tree) and become visible while a drag or transition is running.
 */
export function SwipePager({ index, onIndexChange, onProgress, children, className, paneAttr = 'data-pager-pane', paneKeys, paneLabels, rootProps }: SwipePagerProps) {
  const panes = Children.toArray(children)
  const count = panes.length
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const cur = useRef(index)
  const first = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const raf = useRef(0)
  const cb = useRef({ onIndexChange, onProgress })
  cb.current = { onIndexChange, onProgress }
  const [moving, setMoving] = useState(false)
  cur.current = index

  const place = useCallback((px: number, animate: boolean) => {
    const t = track.current
    if (!t) return
    t.style.transition = animate ? `transform ${SPRING_MS}ms ${SPRING}` : 'none'
    t.style.transform = `translate3d(${px}px,0,0)`
  }, [])

  const run = useCallback(() => {
    setMoving(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMoving(false), SPRING_MS + 60)
  }, [])

  // Controlled index → animated settle (instant on first paint).
  useLayoutEffect(() => {
    const w = root.current?.clientWidth ?? 0
    place(-index * w, !first.current)
    if (!first.current) run()
    first.current = false
    cb.current.onProgress?.(index, false)
  }, [index, place, run])

  useEffect(() => {
    const el = root.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => place(-cur.current * el.clientWidth, false))
    ro.observe(el)
    return () => ro.disconnect()
  }, [place])

  useEffect(() => () => { clearTimeout(timer.current); cancelAnimationFrame(raf.current) }, [])

  // Touch engine (native listeners: touchmove must be non-passive to claim horizontal gestures).
  useEffect(() => {
    const el = root.current
    if (!el) return
    let x0 = 0, y0 = 0, dx = 0, axis: 'idle' | 'h' | 'v' = 'idle', skip = false, w = 1
    let samples: { x: number; t: number }[] = []
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) { skip = true; return }
      const t = e.touches[0]!
      x0 = t.clientX; y0 = t.clientY; dx = 0; axis = 'idle'; w = el.clientWidth || 1
      skip = !!(e.target as Element).closest?.('[data-no-swipe],input,textarea,select,[role="slider"]') || insideHorizontalScroller(e.target as Element, el)
      samples = [{ x: t.clientX, t: performance.now() }]
    }
    const move = (e: TouchEvent) => {
      if (skip || axis === 'v') return
      const t = e.touches[0]!
      const mx = t.clientX - x0, my = t.clientY - y0
      if (axis === 'idle') {
        axis = swipeAxis(mx, my)
        if (axis !== 'h') return
        clearTimeout(timer.current); setMoving(true)
      }
      if (e.cancelable) e.preventDefault()
      dx = edgeResist(mx, cur.current, count)
      samples.push({ x: t.clientX, t: performance.now() })
      if (samples.length > 12) samples.shift()
      place(-cur.current * w + dx, false)
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(() => cb.current.onProgress?.(cur.current - dx / w, true))
    }
    const end = () => {
      const was = axis
      axis = 'idle'
      if (skip || was !== 'h') { skip = false; return }
      const last = samples[samples.length - 1]
      let firstS = samples[0]
      for (const s of samples) if (last && last.t - s.t <= 100) { firstS = s; break }
      const v = last && firstS && last.t > firstS.t ? (last.x - firstS.x) / (last.t - firstS.t) : 0
      const target = settleIndex(cur.current, dx, v, w, count)
      cancelAnimationFrame(raf.current)
      place(-target * w, true); run()
      cb.current.onProgress?.(target, false)
      if (target !== cur.current) cb.current.onIndexChange(target)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end, { passive: true })
    el.addEventListener('touchcancel', end, { passive: true })
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end) }
  }, [count, place, run])

  // The clipped viewport must never scroll natively (focus / scrollIntoView inside a pane would otherwise shift it).
  const pin = () => { const el = root.current; if (el && el.scrollLeft !== 0) el.scrollLeft = 0 }

  return (
    <div ref={root} onScroll={pin} data-pager data-active-pane={paneKeys?.[index]} data-pager-index={index} {...rootProps}
      className={['relative h-full w-full min-w-0 overflow-hidden', className].filter(Boolean).join(' ')} style={{ touchAction: 'pan-y' }}>
      <div ref={track} data-pager-track className="flex h-full w-full" style={{ willChange: 'transform', transform: 'translate3d(0,0,0)' }}>
        {panes.map((p, i) => {
          const key = paneKeys?.[i] ?? String(i)
          const visible = moving || i === index
          return (
            <section key={key} {...{ [paneAttr]: key }} aria-label={paneLabels?.[i]} aria-hidden={i !== index || undefined} inert={i !== index && !moving}
              className="relative h-full min-w-0 overflow-hidden" style={{ flex: '0 0 100%', width: '100%', contain: 'layout paint', visibility: visible ? 'visible' : 'hidden', touchAction: 'pan-y' }}>
              {p}
            </section>
          )
        })}
      </div>
    </div>
  )
}
