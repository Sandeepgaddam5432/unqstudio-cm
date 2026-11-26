/** Keyboard navigation state transitions for the windowed ModelPicker (pure, unit-tested). */
export type NavKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'
export const NAV_KEYS: NavKey[] = ['ArrowDown', 'ArrowUp', 'Home', 'End']

/** Row indices that can hold the active highlight (provider headers and model rows). */
export function selectableRows(rows: { t: string }[]): number[] {
  const out: number[] = []
  rows.forEach((r, i) => { if (r.t === 'head' || r.t === 'model') out.push(i) })
  return out
}

/** Next active row index for a navigation key; arrows wrap around, -1 means "nothing active yet". */
export function moveActive(selectable: number[], current: number, key: NavKey): number {
  if (!selectable.length) return -1
  const pos = selectable.indexOf(current)
  switch (key) {
    case 'Home': return selectable[0]!
    case 'End': return selectable[selectable.length - 1]!
    case 'ArrowDown': return selectable[pos < 0 ? 0 : (pos + 1) % selectable.length]!
    case 'ArrowUp': return selectable[pos < 0 ? selectable.length - 1 : (pos - 1 + selectable.length) % selectable.length]!
  }
}

/** Minimal scrollTop that brings the row fully into the virtual window. */
export function scrollTopFor(index: number, rowH: number, top: number, viewH: number): number {
  const rowTop = index * rowH
  if (rowTop < top) return rowTop
  if (rowTop + rowH > top + viewH) return rowTop + rowH - viewH
  return top
}
