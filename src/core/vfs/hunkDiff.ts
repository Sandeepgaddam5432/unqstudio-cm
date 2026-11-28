/** Per-hunk diff: split a before→after change into independent hunks and apply any subset (accept/reject per hunk). */
import { diffArrays } from 'diff'

export interface Hunk { index: number; beforeStart: number; afterStart: number; removed: string[]; added: string[]; contextBefore: string[]; contextAfter: string[] }
type Part = { equal: true; lines: string[] } | { equal: false; removed: string[]; added: string[] }

function parts(before: string, after: string): Part[] {
  const out: Part[] = []
  for (const c of diffArrays(before.split('\n'), after.split('\n'))) {
    if (!c.added && !c.removed) out.push({ equal: true, lines: c.value })
    else {
      const last = out[out.length - 1]
      const g: Extract<Part, { equal: false }> = last && !last.equal ? last : (out.push({ equal: false, removed: [], added: [] }), out[out.length - 1] as Extract<Part, { equal: false }>)
      if (c.removed) g.removed.push(...c.value); else g.added.push(...c.value)
    }
  }
  return out
}

export function computeHunks(before: string, after: string, context = 2): Hunk[] {
  const ps = parts(before, after)
  const hunks: Hunk[] = []
  let b = 1
  let a = 1
  ps.forEach((p, i) => {
    if (p.equal) { b += p.lines.length; a += p.lines.length; return }
    const prev = ps[i - 1]; const next = ps[i + 1]
    hunks.push({ index: hunks.length, beforeStart: b, afterStart: a, removed: p.removed, added: p.added, contextBefore: prev?.equal ? prev.lines.slice(-context) : [], contextAfter: next?.equal ? next.lines.slice(0, context) : [] })
    b += p.removed.length; a += p.added.length
  })
  return hunks
}

/** Result text when only the hunks in `accepted` are applied (all → `after`, none → `before`). */
export function applyHunks(before: string, after: string, accepted: ReadonlySet<number>): string {
  let h = 0
  const out: string[] = []
  for (const p of parts(before, after)) {
    if (p.equal) out.push(...p.lines)
    else out.push(...(accepted.has(h++) ? p.added : p.removed))
  }
  return out.join('\n')
}

/** Unified-diff-style preview of one hunk for UI/tests. */
export const hunkPreview = (h: Hunk): string => [`@@ -${h.beforeStart},${h.removed.length} +${h.afterStart},${h.added.length} @@`, ...h.contextBefore.map((l) => ' ' + l), ...h.removed.map((l) => '-' + l), ...h.added.map((l) => '+' + l), ...h.contextAfter.map((l) => ' ' + l)].join('\n')
