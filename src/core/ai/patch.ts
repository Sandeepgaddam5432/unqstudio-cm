export interface PatchBlock { search: string; replace: string }
export interface PatchFailure { index: number; reason: string; search: string }
export interface PatchResult { ok: boolean; content: string; applied: number; failures: PatchFailure[] }

const BLOCK = /<{5,9}\s*SEARCH\r?\n([\s\S]*?)\r?\n?={5,9}\r?\n([\s\S]*?)\r?\n?>{5,9}\s*REPLACE/g

export function parsePatchBlocks(body: string): PatchBlock[] {
  const out: PatchBlock[] = []
  for (const m of body.matchAll(BLOCK)) out.push({ search: m[1].replace(/\r\n/g, '\n'), replace: m[2].replace(/\r\n/g, '\n') })
  return out
}

const indentOf = (l: string) => /^[ \t]*/.exec(l)![0]

function fuzzyApply(content: string, search: string, replace: string): string | null {
  const cl = content.split('\n')
  const sl = search.split('\n')
  while (sl.length && !sl[0].trim()) sl.shift()
  while (sl.length && !sl[sl.length - 1].trim()) sl.pop()
  if (!sl.length) return null
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ')
  for (let i = 0; i + sl.length <= cl.length; i++) {
    let ok = true
    for (let j = 0; j < sl.length; j++) if (norm(cl[i + j]) !== norm(sl[j])) { ok = false; break }
    if (!ok) continue
    const matchedIndent = indentOf(cl[i])
    const searchIndent = indentOf(sl[0])
    const rl = replace.split('\n').map((l) => {
      if (!l.trim()) return l
      return l.startsWith(searchIndent) ? matchedIndent + l.slice(searchIndent.length) : matchedIndent + l.trimStart()
    })
    return [...cl.slice(0, i), ...rl, ...cl.slice(i + sl.length)].join('\n')
  }
  return null
}

/** Apply SEARCH/REPLACE blocks sequentially: exact match first, then whitespace-tolerant line match. All-or-nothing. */
export function applyPatch(original: string, blocks: PatchBlock[]): PatchResult {
  let content = original.replace(/\r\n/g, '\n')
  const failures: PatchFailure[] = []
  let applied = 0
  if (!blocks.length) return { ok: false, content: original, applied: 0, failures: [{ index: 0, reason: 'No valid SEARCH/REPLACE blocks found in patch', search: '' }] }
  blocks.forEach((b, index) => {
    if (!b.search.trim()) {
      content = content.trim() === '' ? b.replace : content.replace(/\n*$/, '\n') + b.replace
      applied++
      return
    }
    const i = content.indexOf(b.search)
    if (i >= 0) {
      content = content.slice(0, i) + b.replace + content.slice(i + b.search.length)
      applied++
      return
    }
    const trimmedSearch = b.search.replace(/\n+$/, '')
    const j = content.indexOf(trimmedSearch)
    if (j >= 0 && trimmedSearch.trim()) {
      content = content.slice(0, j) + b.replace.replace(/\n+$/, '') + content.slice(j + trimmedSearch.length)
      applied++
      return
    }
    const fz = fuzzyApply(content, b.search, b.replace)
    if (fz !== null) {
      content = fz
      applied++
      return
    }
    failures.push({ index, reason: 'SEARCH block not found in file (the file may have changed – re-read it)', search: b.search.slice(0, 120) })
  })
  return failures.length ? { ok: false, content: original, applied, failures } : { ok: true, content, applied, failures }
}
