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
