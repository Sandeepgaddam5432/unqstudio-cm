import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { navigateToView, type AppView } from '@/store/app'
import { SwipePager } from '@/ui/primitives/SwipePager'

export const SHELL_VIEWS: AppView[] = ['home', 'projects', 'chats']

/** Pure: which pane a horizontal scroll position settles on (kept for the v3.2 contract + tests). */
export function paneIndex(scrollLeft: number, width: number, count = SHELL_VIEWS.length): number {
  if (width <= 0) return 0
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / width)))
}

/** True only inside the pane that is currently on screen — floating CTAs (`+ New project`, `+ New chat`) render only when their pane is active. */
export const PaneActive = createContext(true)
export const usePaneActive = () => useContext(PaneActive)

/** Publishes the (fractional) pane position for the floating nav pill; `data-nav-drag` disables the pill's own spring while the finger drives it. */
function publishProgress(position: number, dragging: boolean) {
  const root = document.documentElement
  root.style.setProperty('--nav-progress', position.toFixed(3))
  if (dragging) root.dataset.navDrag = '1'; else delete root.dataset.navDrag
}

/**
 * Mobile (<768px) 3-tab pager: Home ⇄ Projects ⇄ Chats on the zero-overlap `SwipePager` (clipped viewport, one GPU flex track,
 * panes exactly one viewport wide with `contain: layout paint`). The route (hash) is committed when the spring settles.
 */
export function MobileShell({ view, panes }: { view: AppView; panes: Record<AppView, ReactNode> }) {
  const idx = Math.max(0, SHELL_VIEWS.indexOf(view))
  const change = useCallback((i: number) => navigateToView(SHELL_VIEWS[i]!), [])
  return (
    <SwipePager index={idx} onIndexChange={change} onProgress={publishProgress} paneAttr="data-shell-pane" paneKeys={SHELL_VIEWS} rootProps={{ 'data-mobile-shell': '', 'data-shell-index': idx }}>
      {SHELL_VIEWS.map((v, i) => (
        <PaneActive.Provider key={v} value={i === idx}>
          <div className={v === 'home' ? 'h-full w-full overflow-hidden' : 'h-full w-full overflow-y-auto overflow-x-hidden overscroll-y-contain'} style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }} data-pane-scroll={v}>{panes[v]}</div>
        </PaneActive.Provider>
      ))}
    </SwipePager>
  )
}
