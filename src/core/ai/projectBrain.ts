/**
 * Project Brain (v3.6, core): BM25 relevance ranking over path + symbols + content, `export *` / re-export resolution and the
 * reverse importer graph (`usedBy`). Pure functions over `{ path: text }`; the existing `repoMap.ts` remains the live context
 * builder (PARTIAL: ranker not yet injected into `buildProjectContext`, no worker/off-main-thread cache).
 */
const CODE = /\.(tsx?|jsx?|mts|cts)$/
export function tokenize(s: string): string[] {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1)
}
const exportNames = (src: string): string[] => {
  const names: string[] = []
  for (const m of src.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g)) names.push(m[1])
  return names
}

export interface Ranked { path: string; score: number }
export function rankFiles(query: string, files: Record<string, string>, opts: { topK?: number; charBudget?: number; k1?: number; b?: number } = {}): Ranked[] {
  const q = [...new Set(tokenize(query))]
  const paths = Object.keys(files).filter((p) => CODE.test(p) || /\.(css|json|md|html)$/.test(p))
  if (!q.length || !paths.length) return []
  const docs = paths.map((p) => {
    const toks = [...tokenize(p), ...tokenize(p), ...tokenize(p), ...exportNames(files[p]).flatMap((n) => [...tokenize(n), ...tokenize(n)]), ...tokenize(files[p])]
    const tf = new Map<string, number>()
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1)
    return { p, tf, len: toks.length }
  })
  const avg = docs.reduce((s, d) => s + d.len, 0) / docs.length || 1
  const k1 = opts.k1 ?? 1.5
  const b = opts.b ?? 0.75
  const N = docs.length
  const df = new Map<string, number>()
  for (const t of q) df.set(t, docs.filter((d) => d.tf.has(t)).length)
  const ranked = docs.map((d) => {
    let score = 0
    for (const t of q) {
      const f = d.tf.get(t) ?? 0
      if (!f) continue
      const n = df.get(t) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avg)))
    }
    return { path: d.p, score }
  }).filter((r) => r.score > 0).sort((a, c) => c.score - a.score || a.path.localeCompare(c.path))
  const out: Ranked[] = []
  let used = 0
  for (const r of ranked) {
    const cost = files[r.path].length
    if (opts.charBudget !== undefined && used + cost > opts.charBudget && out.length) continue
    out.push(r); used += cost
    if (out.length >= (opts.topK ?? 8)) break
  }
  return out
}

function resolveSpec(from: string, spec: string, files: Record<string, string>): string | undefined {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return undefined
  const baseParts = spec.startsWith('@/') ? ['src', ...spec.slice(2).split('/')] : [...from.split('/').slice(1, -1), ...spec.split('/')]
  const stack: string[] = []
  for (const s of baseParts) { if (s === '..') stack.pop(); else if (s !== '.' && s) stack.push(s) }
  const base = '/' + stack.join('/')
  for (const cand of [base, ...['.ts', '.tsx', '.js', '.jsx'].map((e) => base + e), ...['/index.ts', '/index.tsx', '/index.js'].map((e) => base + e)]) if (cand in files) return cand
  return undefined
}

/** Effective export names per file, following `export * from`, `export { a as b } from` and local exports (cycle-safe). */
export function resolveExports(files: Record<string, string>): Map<string, Set<string>> {
  const memo = new Map<string, Set<string>>()
  const visit = (path: string, stack: Set<string>): Set<string> => {
    if (memo.has(path)) return memo.get(path)!
    const out = new Set<string>()
    if (stack.has(path) || !(path in files)) return out
    stack.add(path)
    const src = files[path]
    for (const n of exportNames(src)) out.add(n)
    if (/export\s+default\b/.test(src)) out.add('default')
    for (const m of src.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)) { const t = resolveSpec(path, m[1], files); if (t) for (const n of visit(t, stack)) if (n !== 'default') out.add(n) }
    for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/g)) for (const part of m[1].split(',')) { const [, as] = /^\s*(?:[\w$]+|default)(?:\s+as\s+([\w$]+))?\s*$/.exec(part) ?? []; const id = (as ?? part.trim()).trim(); if (id) out.add(id) }
    stack.delete(path)
    memo.set(path, out)
    return out
  }
  for (const p of Object.keys(files)) if (CODE.test(p)) visit(p, new Set())
  return memo
}

/** Reverse importer graph: path → files that import it (relative and `@/` specifiers). */
export function usedBy(files: Record<string, string>): Map<string, string[]> {
  const rev = new Map<string, string[]>()
  for (const [p, src] of Object.entries(files)) {
    if (!CODE.test(p)) continue
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) { const t = resolveSpec(p, m[1], files); if (t) rev.set(t, [...new Set([...(rev.get(t) ?? []), p])]) }
  }
  return rev
}
