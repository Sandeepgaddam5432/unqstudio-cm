// Project Symbol Map: a compact structural summary of every .ts/.tsx/.js/.jsx/.css file (exports, hooks, types, imports).
// Injected by prompts.buildProjectContext so the model sees the whole architecture at a fraction of the tokens, while the
// full-text budget goes to pinned / @mentioned / entry files.

export type SymbolKind = 'component' | 'hook' | 'function' | 'class' | 'interface' | 'type' | 'enum' | 'const' | 'default'
export interface SymbolRef { name: string; kind: SymbolKind }
export interface FileSymbols { path: string; exports: SymbolRef[]; imports: string[]; css: string[] }

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
  return out
}

const isLocal = (s: string) => s.startsWith('.') || s.startsWith('@/') || s.startsWith('/')

/** One line per file: `/src/App.tsx — exports: App (component), useX (hook) · imports: ./Header, @/store · pkgs: react`. */
export function formatSymbols(s: FileSymbols): string {
  const ex = s.exports.map((e) => (e.kind === 'default' ? 'default export' : `${e.name} (${e.kind})`)).join(', ')
  const local = s.imports.filter(isLocal), pkgs = [...new Set(s.imports.filter((i) => !isLocal(i)).map((i) => (i.startsWith('@') ? i.split('/').slice(0, 2).join('/') : i.split('/')[0]!)))]
  const parts: string[] = []
  if (ex) parts.push(`exports: ${ex}`)
  if (s.css.length) parts.push(`defines: ${s.css.join(' ')}`)
  if (local.length) parts.push(`imports: ${local.join(', ')}`)
  if (pkgs.length) parts.push(`pkgs: ${pkgs.join(', ')}`)
  return `${s.path} — ${parts.join(' · ') || 'no exports'}`
}

export function buildRepoMap(files: { path: string; content: string }[]): { text: string; entries: number } {
  const lines = files.filter((f) => isMappable(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map((f) => formatSymbols(extractSymbols(f.path, f.content)))
  return { text: lines.join('\n'), entries: lines.length }
}
