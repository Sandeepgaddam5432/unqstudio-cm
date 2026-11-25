import { diffLines } from 'diff'

export function countLineChanges(before: string, after: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const part of diffLines(before, after)) {
    const n = part.count ?? part.value.split('\n').length - (part.value.endsWith('\n') ? 1 : 0)
    if (part.added) added += n
    else if (part.removed) removed += n
  }
  return { added, removed }
}

export interface DiffCell { n: number; text: string; type: 'ctx' | 'del' | 'add' }
export type SplitRow = { left?: DiffCell; right?: DiffCell; skip?: number }
export type UnifiedRow = { cell?: DiffCell; skip?: number }

function splitLines(v: string): string[] {
  const l = v.split('\n')
  if (l[l.length - 1] === '') l.pop()
  return l
}

function collapse<T>(rows: T[], isCtx: (r: T) => boolean, mk: (n: number) => T, context: number): T[] {
  const out: T[] = []
  let i = 0
  while (i < rows.length) {
    if (!isCtx(rows[i])) { out.push(rows[i++]); continue }
    let j = i
    while (j < rows.length && isCtx(rows[j])) j++
    const run = rows.slice(i, j)
    const head = i === 0 ? 0 : context
    const tail = j === rows.length ? 0 : context
    if (run.length > head + tail + 1) {
      out.push(...run.slice(0, head), mk(run.length - head - tail), ...run.slice(run.length - tail))
    } else out.push(...run)
    i = j
  }
  return out
}

/** Side-by-side rows: removed/added blocks are paired line-by-line; long unchanged runs collapse into a "skip" row. */
export function buildSplitRows(before: string, after: string, context = 3): SplitRow[] {
  const parts = diffLines(before, after)
  const rows: SplitRow[] = []
  let l = 1
  let r = 1
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!p.added && !p.removed) {
      for (const t of splitLines(p.value)) rows.push({ left: { n: l++, text: t, type: 'ctx' }, right: { n: r++, text: t, type: 'ctx' } })
    } else if (p.removed) {
      const dels = splitLines(p.value)
      const next = parts[i + 1]
      const adds = next?.added ? splitLines(next.value) : []
      if (next?.added) i++
      for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
        rows.push({
          left: k < dels.length ? { n: l++, text: dels[k], type: 'del' } : undefined,
          right: k < adds.length ? { n: r++, text: adds[k], type: 'add' } : undefined,
        })
      }
    } else for (const t of splitLines(p.value)) rows.push({ right: { n: r++, text: t, type: 'add' } })
  }
  return collapse(rows, (x) => x.left?.type === 'ctx', (n) => ({ skip: n }), context)
}

export function buildUnifiedRows(before: string, after: string, context = 3): UnifiedRow[] {
  let l = 1
  let r = 1
  const rows: UnifiedRow[] = []
  for (const p of diffLines(before, after)) {
    for (const t of splitLines(p.value)) {
      if (p.added) rows.push({ cell: { n: r++, text: t, type: 'add' } })
      else if (p.removed) rows.push({ cell: { n: l++, text: t, type: 'del' } })
      else { rows.push({ cell: { n: r, text: t, type: 'ctx' } }); l++; r++ }
    }
  }
  return collapse(rows, (x) => x.cell?.type === 'ctx', (n) => ({ skip: n }), context)
}
