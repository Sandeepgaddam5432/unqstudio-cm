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
