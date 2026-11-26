// Project Symbol Map: a compact structural summary of every .ts/.tsx/.js/.jsx/.css file (exports, hooks, types, imports).
// Injected by prompts.buildProjectContext so the model sees the whole architecture at a fraction of the tokens, while the
// full-text budget goes to pinned / @mentioned / entry files.

export type SymbolKind = 'component' | 'hook' | 'store' | 'function' | 'class' | 'interface' | 'type' | 'enum' | 'const' | 'default'
export interface SymbolRef { name: string; kind: SymbolKind; /** Props interface/type name of a component (e.g. `CardProps`). */ props?: string }
export interface FileSymbols { path: string; exports: SymbolRef[]; imports: string[]; css: string[]; /** `export * from` / `export {…} from` sources. */ reexports?: string[] }

export const isMappable = (path: string) => /\.(tsx?|jsx?|mjs|css)$/.test(path)

const kindOf = (name: string, fallback: SymbolKind): SymbolKind => (/^use[A-Z0-9]/.test(name) ? 'hook' : /^[A-Z]/.test(name) && /[a-z]/.test(name) && (fallback === 'function' || fallback === 'const') ? 'component' : fallback)

export function extractSymbols(path: string, content: string): FileSymbols {
  const out: FileSymbols = { path, exports: [], imports: [], css: [] }
  if (/\.css$/.test(path)) {
    const seen = new Set<string>()
    const add = (s: string) => { if (!seen.has(s) && seen.size < 14) { seen.add(s); out.css.push(s) } }
    for (const m of content.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g)) out.imports.push(m[1]!)
    for (const m of content.matchAll(/@(theme|layer|keyframes|font-face|utility|custom-variant)\s*([\w-]*)/g)) add(`@${m[1]}${m[2] ? ' ' + m[2] : ''}`)
    for (const m of content.matchAll(/(^|[\s,}])\.([a-zA-Z_][\w-]*)/g)) add('.' + m[2])
    for (const m of content.matchAll(/(--[\w-]+)\s*:/g)) add(m[1]!)
    return out
  }
  const src = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const push = (name: string, kind: SymbolKind) => { if (name && !out.exports.some((e) => e.name === name)) out.exports.push({ name, kind }) }
  for (const m of src.matchAll(/^\s*export\s+(default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?/gm)) { const n = m[2]; if (n) push(n, kindOf(n, 'function')); else if (m[1]) push('default', 'default') }
  for (const m of src.matchAll(/^\s*export\s+(?:declare\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) push(m[2]!, kindOf(m[2]!, 'const'))
  for (const m of src.matchAll(/^\s*export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) push(m[1]!, 'class')
  for (const m of src.matchAll(/^\s*export\s+(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)/gm)) push(m[1]!, 'interface')
  for (const m of src.matchAll(/^\s*export\s+(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)/gm)) push(m[1]!, 'type')
  for (const m of src.matchAll(/^\s*export\s+(?:declare\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/gm)) push(m[1]!, 'enum')
  for (const m of src.matchAll(/^\s*export\s*(type\s*)?\{([^}]*)\}/gm)) for (const part of m[2]!.split(',')) { const n = part.trim().split(/\s+as\s+/).pop()!.trim(); if (n && /^[A-Za-z_$][\w$]*$/.test(n)) push(n, m[1] ? 'type' : kindOf(n, 'const')) }
  if (/^\s*export\s+default\s+(?!function|class|async)/m.test(src)) push('default', 'default')
  const imps = new Set<string>()
  for (const m of src.matchAll(/(?:^|\n)\s*import\s+(?:type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?['"]([^'"]+)['"]/g)) imps.add(m[1]!)
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) imps.add(m[1]!)
  for (const m of src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) imps.add(m[1]!)
  out.imports = [...imps]
  const re = [...src.matchAll(/^\s*export\s+(?:type\s+)?\*(?:\s+as\s+\w+)?\s+from\s+['"]([^'"]+)['"]/gm), ...src.matchAll(/^\s*export\s+(?:type\s+)?\{[^}]*\}\s*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!)
  if (re.length) out.reexports = [...new Set(re)]
  for (const e of out.exports) {
    if (e.kind === 'component') { const pr = propsOf(src, e.name); if (pr) e.props = pr }
    if (/^use[A-Z0-9]/.test(e.name) && isStoreSlice(src, e.name)) e.kind = 'store'
  }
  return out
}

/** Props interface/type name of a component: `function X({..}: XProps)`, `const X = (props: XProps) =>`, memo/forwardRef wrappers or `FC<XProps>`. */
export function propsOf(src: string, name: string): string | undefined {
  const n = name.replace(/[$]/g, '\\$')
  const fn = new RegExp(`function\\s+${n}\\s*(?:<[^>]*>)?\\(\\s*(?:\\{[^)]*?\\}|\\w+)\\s*:\\s*([A-Za-z_$][\\w$.]*)`).exec(src)
  if (fn) return fn[1]
  const arrow = new RegExp(`const\\s+${n}\\s*(?::[^=]+)?=\\s*(?:(?:React\\.)?(?:memo|forwardRef)(?:<[^>]*>)?\\(\\s*)?(?:async\\s*)?(?:function\\s*\\w*\\s*)?\\(\\s*(?:\\{[^)]*?\\}|\\w+)\\s*:\\s*([A-Za-z_$][\\w$.]*)`).exec(src)
  if (arrow) return arrow[1]
  const fc = new RegExp(`const\\s+${n}\\s*:\\s*(?:React\\.)?(?:FC|FunctionComponent|VFC)<\\s*([A-Za-z_$][\\w$.]*)\\s*>`).exec(src)
  return fc?.[1]
}

/** zustand-style slice: `export const useX = create<State>()(…)` / `create(…)` (optionally wrapped by persist/devtools). */
export function isStoreSlice(src: string, name: string): boolean {
  return new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*create(?:<[^>]*>)?\\s*\\(`).test(src)
}

const isLocal = (s: string) => s.startsWith('.') || s.startsWith('@/') || s.startsWith('/')

/** One line per file: `/src/App.tsx — exports: App (component), useX (hook) · imports: ./Header, @/store · pkgs: react`. */
export function formatSymbols(s: FileSymbols): string {
  const ex = s.exports.map((e) => (e.kind === 'default' ? 'default export' : `${e.name} (${e.kind}${e.props ? `, props: ${e.props}` : ''})`)).join(', ')
  const local = s.imports.filter(isLocal), pkgs = [...new Set(s.imports.filter((i) => !isLocal(i)).map((i) => (i.startsWith('@') ? i.split('/').slice(0, 2).join('/') : i.split('/')[0]!)))]
  const parts: string[] = []
  if (ex) parts.push(`exports: ${ex}`)
  if (s.css.length) parts.push(`defines: ${s.css.join(' ')}`)
  if (local.length) parts.push(`imports: ${local.join(', ')}`)
  if (s.reexports?.length) parts.push(`re-exports: ${s.reexports.join(', ')}`)
  if (pkgs.length) parts.push(`pkgs: ${pkgs.join(', ')}`)
  return `${s.path} — ${parts.join(' · ') || 'no exports'}`
}

export function buildRepoMap(files: { path: string; content: string }[]): { text: string; entries: number } {
  const lines = files.filter((f) => isMappable(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map((f) => formatSymbols(extractSymbols(f.path, f.content)))
  const g = buildSymbolGraph(files)
  const edgeLines = g.files.filter((f) => g.edges.some((e) => e.from === f.path)).map((f) => `${f.path} → ${g.edges.filter((e) => e.from === f.path).map((e) => e.to).join(', ')}`)
  return { text: lines.join('\n') + (edgeLines.length ? `\n\nLocal import edges (file → depends on):\n${edgeLines.join('\n')}` : ''), entries: lines.length }
}

const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']

/** Resolve a relative / `@/` / absolute import specifier to a project path (or null for packages / unresolved). */
export function resolveImport(from: string, spec: string, paths: Set<string>): string | null {
  let base: string
  if (spec.startsWith('@/')) base = '/src/' + spec.slice(2)
  else if (spec.startsWith('/')) base = spec
  else if (spec.startsWith('.')) {
    const parts = from.split('/').slice(0, -1)
    for (const seg of spec.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg) }
    base = parts.join('/') || '/'
  } else return null
  for (const e of EXTS) if (paths.has(base + e)) return base + e
  return null
}

export interface SymbolGraph { files: FileSymbols[]; edges: { from: string; to: string }[]; usedBy: Record<string, string[]> }

/** Cross-file graph: exported symbols per file plus resolved local import / re-export edges. */
export function buildSymbolGraph(files: { path: string; content: string }[]): SymbolGraph {
  const mappable = files.filter((f) => isMappable(f.path))
  const paths = new Set(mappable.map((f) => f.path))
  const syms = mappable.map((f) => extractSymbols(f.path, f.content)).sort((a, b) => a.path.localeCompare(b.path))
  const edges: { from: string; to: string }[] = []
  const usedBy: Record<string, string[]> = {}
  for (const f of syms) for (const spec of new Set([...f.imports, ...(f.reexports ?? [])])) {
    const to = resolveImport(f.path, spec, paths)
    if (to && to !== f.path && !edges.some((e) => e.from === f.path && e.to === to)) { edges.push({ from: f.path, to }); (usedBy[to] ??= []).push(f.path) }
  }
  return { files: syms, edges, usedBy }
}
