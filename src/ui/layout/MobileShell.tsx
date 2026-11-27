import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { navigateToView, type AppView } from '@/store/app'

export const SHELL_VIEWS: AppView[] = ['home', 'projects', 'chats']

/** Pure: which pane a horizontal scroll position settles on. */
export function paneIndex(scrollLeft: number, width: number, count = SHELL_VIEWS.length): number {
  if (width <= 0) return 0
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / width)))
}

/**
 * Mobile (<768px) horizontal swipe shell: Home ⇄ Projects ⇄ Chats as three scroll-snap panes.
 * The floating bottom pill follows the finger through the `--nav-progress` CSS variable; the route (hash) is committed once the
 * gesture settles. Inner horizontal scrollers (chips, carousels) keep their own pan because the browser gives a touch to the
 * innermost scroller that can scroll in that direction.
 */
export function MobileShell({ view, panes }: { view: AppView; panes: Record<AppView, ReactNode> }) {
  const ref = useRef<HTMLDivElement>(null)
  const idx = SHELL_VIEWS.indexOf(view)
  const cur = useRef(idx)
  const first = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const touching = useRef(false)
  const raf = useRef(0)
  cur.current = idx

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const left = idx * el.clientWidth
    document.documentElement.style.setProperty('--nav-progress', String(first.current ? idx : el.scrollLeft / (el.clientWidth || 1)))
    if (Math.abs(el.scrollLeft - left) > 2) el.scrollTo({ left, behavior: first.current ? 'auto' : 'smooth' })
    first.current = false
  }, [idx])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (!touching.current) el.scrollLeft = cur.current * el.clientWidth })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const settle = () => {
    const el = ref.current
    if (!el || touching.current) return
    const next = paneIndex(el.scrollLeft, el.clientWidth)
    if (next !== cur.current) navigateToView(SHELL_VIEWS[next]!)
  }
  const onScroll = () => {
    const el = ref.current
    if (!el) return
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => document.documentElement.style.setProperty('--nav-progress', (el.scrollLeft / (el.clientWidth || 1)).toFixed(3)))
    clearTimeout(timer.current)
    timer.current = setTimeout(settle, 110)
  }
  useEffect(() => () => { clearTimeout(timer.current); cancelAnimationFrame(raf.current) }, [])

  return (
    <div ref={ref} data-mobile-shell data-shell-index={idx} onScroll={onScroll}
      onTouchStart={() => { touching.current = true }} onTouchEnd={() => { touching.current = false; clearTimeout(timer.current); timer.current = setTimeout(settle, 140) }} onTouchCancel={() => { touching.current = false }}
      className="hide-scroll flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
      {SHELL_VIEWS.map((v, i) => (
        <section key={v} data-shell-pane={v} aria-hidden={i !== idx || undefined} className="h-full w-full min-w-0 shrink-0 snap-center overflow-y-auto overflow-x-hidden overscroll-y-contain" style={{ scrollSnapStop: 'always' }}>
          {panes[v]}
        </section>
      ))}
    </div>
  )
}
