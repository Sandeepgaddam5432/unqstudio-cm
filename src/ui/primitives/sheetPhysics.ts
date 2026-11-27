/** Pure drag physics for the mobile BottomSheet (unit-tested; no DOM). */
export const DISMISS_RATIO = 0.35
export const DISMISS_VELOCITY = 0.6 // px per ms
export const RUBBER_LIMIT = 90

/** Dragging down follows the finger 1:1; dragging up is resisted asymptotically (rubber band) up to RUBBER_LIMIT px. */
export function rubberBand(dy: number, limit = RUBBER_LIMIT): number {
  if (dy >= 0) return dy
  const over = -dy
  return -((over * limit) / (over + limit))
}

export interface DragSample { y: number; t: number }

/** Mean velocity (px/ms, positive = downward) over the last ~100 ms of samples. */
export function velocityOf(samples: DragSample[]): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]!
  let first = samples[0]!
  for (const s of samples) { if (last.t - s.t <= 100) { first = s; break } }
  const dt = last.t - first.t
  return dt > 0 ? (last.y - first.y) / dt : 0
}

/** Dismiss when released fast enough downward, or dragged beyond a share of the sheet height. */
export function shouldDismiss(dy: number, velocity: number, height: number): boolean {
  if (dy <= 0) return false
  return velocity >= DISMISS_VELOCITY || dy >= Math.max(40, height * DISMISS_RATIO)
}

export type SwipeIntent = 'open' | 'close' | 'none'

/** Edge-swipe drawer rule: a mostly-horizontal drag past the threshold opens (rightwards) or closes (leftwards) the drawer. */
export function swipeIntent(dx: number, dy: number, threshold = 56): SwipeIntent {
  if (Math.abs(dx) < threshold || Math.abs(dy) > Math.abs(dx) * 0.8) return 'none'
  return dx > 0 ? 'open' : 'close'
}

/** Nearest vertically-scrollable ancestor of `el` (inclusive) below `root`, or null when the touch started on non-scrolling chrome. */
export function findScrollParent(el: Element | null, root: Element): HTMLElement | null {
  let n: Element | null = el
  while (n && n !== root) {
    if (n instanceof HTMLElement && n.scrollHeight > n.clientHeight + 1) {
      const oy = getComputedStyle(n).overflowY
      if (oy === 'auto' || oy === 'scroll') return n
    }
    n = n.parentElement
  }
  return null
}

/** True when an element (or ancestor below root) scrolls horizontally — such touches never start a sheet drag. */
export function insideHorizontalScroller(el: Element | null, root: Element): boolean {
  let n: Element | null = el
  while (n && n !== root) {
    if (n instanceof HTMLElement && n.scrollWidth > n.clientWidth + 1) {
      const ox = getComputedStyle(n).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
    n = n.parentElement
  }
  return false
}

/**
 * Full-sheet swipe-to-dismiss rule: a mostly-vertical DOWNWARD drag engages the sheet only when the inner list is at the top
 * (scrollTop <= 0, or there is no scroller). Upward drags and horizontal drags always belong to the content.
 */
export function shouldEngageSheetDrag(scrollTop: number, dy: number, dx: number, slop = 6): boolean {
  return scrollTop <= 0 && dy > slop && Math.abs(dy) > Math.abs(dx)
}

/** Downward drag follows the finger with gentle rubber-band resistance so it feels physical, not 1:1 rigid. */
export function sheetTranslate(dy: number): number {
  if (dy <= 0) return 0
  return dy <= 80 ? dy : 80 + (dy - 80) * 0.85
}
