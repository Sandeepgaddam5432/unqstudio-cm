/** Pure swipe-pager physics (unit-tested; no DOM). */
export const AXIS_SLOP = 8
export const SETTLE_RATIO = 0.28
export const SETTLE_VELOCITY = 0.4 // px per ms

/** Lock the gesture axis once the finger moved past the slop: horizontal needs clear dominance, otherwise it is a vertical scroll. */
export function swipeAxis(dx: number, dy: number, slop = AXIS_SLOP): 'idle' | 'h' | 'v' {
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (ax < slop && ay < slop) return 'idle'
  return ax > ay * 1.15 ? 'h' : 'v'
}

/** Dragging past the first / last pane is resisted (rubber band) instead of revealing empty space. */
export function edgeResist(dx: number, index: number, count: number): number {
  if ((index === 0 && dx > 0) || (index === count - 1 && dx < 0)) return dx * 0.28
  return dx
}

/** Which pane a release settles on: far enough OR fast enough in a direction, clamped to [0, count-1]. */
export function settleIndex(index: number, dx: number, velocity: number, width: number, count: number): number {
  let next = index
  if (dx <= -width * SETTLE_RATIO || velocity <= -SETTLE_VELOCITY) next = index + 1
  else if (dx >= width * SETTLE_RATIO || velocity >= SETTLE_VELOCITY) next = index - 1
  return Math.min(count - 1, Math.max(0, next))
}
