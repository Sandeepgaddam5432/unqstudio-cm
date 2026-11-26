// Generates DOCS/02-CODEBASE-MAP.md: an exhaustive file-by-file / symbol-by-symbol map of src/ and functions/.
// Run: npm run docs:map   (verify with: npm run verify:docs)
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { PURPOSES, DIR_PURPOSES } from './codemap-purposes.mjs'

const ROOT = process.cwd()
export const ROOTS = ['src', 'functions']
const isSrc = (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts')
const isTest = (f) => /\.test\.(ts|tsx)$/.test(f)

export function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (isSrc(n)) out.push(p.split('\\').join('/'))
  }
  return out
}

function resolveImport(from, spec) {
  let base
  if (spec.startsWith('@/')) base = 'src/' + spec.slice(2)
  else if (spec.startsWith('.')) base = join(dirname(from), spec).split('\\').join('/')
  else return null
  for (const c of [base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx', base]) if (existsSync(join(ROOT, c)) && statSync(join(ROOT, c)).isFile()) return c
  return null
}

function interfaceBody(src, name) {
  const i = src.search(new RegExp(`(?:export\\s+)?interface\\s+${name}\\b[^{]*\\{`))
  if (i < 0) return null
  let depth = 0, start = src.indexOf('{', i)
  for (let j = start; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1).replace(/^export\s+/, '') }
  return null
}


/** Per-line mask: true when the line STARTS inside a template literal (so `export …` inside code-snippet strings is never a real export). */
export function templateMask(src) {
  const mask = [false]
  let mode = 'code'
  const st = []
  const depth = []
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1]
    if (c === '\n') { if (mode === 'lc') mode = 'code'; mask.push(mode === 'tpl'); continue }
    if (mode === 'lc') continue
    if (mode === 'bc') { if (c === '*' && n === '/') { mode = 'code'; i++ } continue }
    if (mode === 'sq') { if (c === '\\') i++; else if (c === "'") mode = 'code'; continue }
    if (mode === 'dq') { if (c === '\\') i++; else if (c === '"') mode = 'code'; continue }
    if (mode === 'tpl') {
      if (c === '\\') i++
      else if (c === '`') mode = 'code'
      else if (c === '$' && n === '{') { st.push('tpl'); depth.push(0); mode = 'code'; i++ }
      continue
    }
    if (c === '/' && n === '/') { mode = 'lc'; i++ }
    else if (c === '/' && n === '*') { mode = 'bc'; i++ }
    else if (c === "'") mode = 'sq'
    else if (c === '"') mode = 'dq'
    else if (c === '`') mode = 'tpl'
    else if (c === '{' && depth.length) depth[depth.length - 1]++
    else if (c === '}' && depth.length) { if (depth[depth.length - 1] === 0) { depth.pop(); mode = st.pop() } else depth[depth.length - 1]-- }
  }
  return mask
}

/** Public methods of every `export class` (2-space-indented members; private/protected/#/constructor skipped). */
export function classMethods(lines, mask) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/.exec(lines[i])
    if (!m || mask[i]) continue
    const methods = []
    for (let j = i + 1; j < lines.length && lines[j] !== '}'; j++) {
      if (mask[j]) continue
      const l = lines[j]
      const mm = /^  (?!private\b|protected\b|constructor\b|#|_)((?:public\s+|static\s+|async\s+|get\s+|set\s+|override\s+|readonly\s+)*)([A-Za-z]\w*)\s*(?:<[^>]*>)?\(/.exec(l)
      if (mm && /\)\s*(?::[^{=]+)?\{?\s*(?:\{.*\})?\s*$/.test(l.replace(/\s*\{.*$/, ' {'))) {
        let sig = l.trim().replace(/\s*\{\s*(?:[^}]*\})?\s*$/, '')
        if (sig.length > 170) sig = sig.slice(0, 167) + '…'
        methods.push(sig)
      } else if (/^  (?:readonly\s+)?(?:get|set)\s+[A-Za-z]/.test(l)) methods.push(l.trim().replace(/\s*\{.*$/, ''))
    }
    out.push({ name: m[1], methods })
  }
  return out
}

const strConst = (src, id) => new RegExp(`(?:const|let)\\s+${id}\\s*=\\s*'([^']+)'`).exec(src)?.[1] ?? new RegExp(`\\b${id}\\s*=\\s*'([^']+)'`).exec(src)?.[1]

/** IndexedDB databases (literal or const/param-default names), their object stores (+keyPath) and indexes. */
export function idbInfo(src) {
  const dbs = []
  for (const m of src.matchAll(/openDB(?:<[^>]*>)?\(\s*('([^']+)'|([A-Za-z_]\w*))/g)) { const name = m[2] ?? strConst(src, m[3]); if (name && !dbs.includes(name)) dbs.push(name) }
  const vars = {}
  const stores = []
  for (const m of src.matchAll(/(?:const\s+(\w+)\s*=\s*)?[\w.]*createObjectStore\(\s*'([^']+)'(?:\s*,\s*\{([^}]*)\})?/g)) {
    const kp = /keyPath:\s*(\[[^\]]*\]|'[^']*')/.exec(m[3] ?? '')?.[1]?.replace(/'/g, '')
    stores.push({ name: m[2], keyPath: kp ?? 'out-of-line key', indexes: [] })
    if (m[1]) vars[m[1]] = m[2]
  }
  for (const m of src.matchAll(/(\w+)\.createIndex\(\s*'([^']+)'\s*,\s*('[^']*'|\[[^\]]*\])/g)) { const st = stores.find((x) => x.name === vars[m[1]]); if (st) st.indexes.push(`${m[2]}(${m[3].replace(/'/g, '')})`) }
  return { dbs, stores }
}

/** Storage keys: sessionStorage (`unq.session.*`), localStorage (zustand persist names + direct get/setItem). */
export function storageKeys(src) {
  const clean = (k) => k.replace(/\$\{([^}]*)\}/g, '<$1>')
  const session = new Set(), local = new Set()
  const usesSession = /sessionStorage/.test(src)
  for (const m of src.matchAll(/['"`](unq\.session\.[^'"`]*)['"`]/g)) session.add(clean(m[1]))
  for (const m of src.matchAll(/name:\s*'(unq\.[A-Za-z0-9.]+)'/g)) local.add(m[1])
  for (const m of src.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*(?:'([^']+)'|([A-Za-z_]\w*))/g)) { const k = m[1] ?? strConst(src, m[2]); if (k) local.add(k) }
  if (!usesSession) session.clear()
  return { session: [...session], local: [...local] }
}

function analyse(file) {
  const src = readFileSync(join(ROOT, file), 'utf8')
  const lines = src.split('\n')
  const exports = []
  const mask = templateMask(src)
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue
    const l = lines[i]
    const m = /^export\s+(default\s+)?(async\s+)?(function\*?|const|let|class|interface|type|enum|abstract class)\s+([A-Za-z0-9_$]+)?/.exec(l)
    if (m) {
      let sig = l.replace(/\s*\{\s*$/, '').replace(/\s*=\s*(async\s*)?\(?.*=>.*$/, (x) => x.length > 60 ? ' = …' : x).trim()
      if (sig.length > 170) sig = sig.slice(0, 167) + '…'
      exports.push({ kind: m[3], name: m[4] ?? 'default', sig })
    } else if (/^export\s*\{/.test(l)) exports.push({ kind: 're-export', name: l.trim(), sig: l.trim().slice(0, 170) })
    else if (/^export \* from/.test(l)) exports.push({ kind: 're-export', name: l.trim(), sig: l.trim() })
  }
  const deps = new Set()
  for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const r = resolveImport(file, m[1] ?? m[2]); if (r && r !== file) deps.add(r)
  }
  const ext = [...new Set([...src.matchAll(/from\s+['"]((?:@[a-z0-9-]+\/)?[a-z0-9][^'"/]*(?:\/[^'"]+)?)['"]/g)].map((m) => m[1]).filter((s) => !s.startsWith('@/')))]
  const stores = [...src.matchAll(/export const (use[A-Za-z]+)\s*=\s*create<([A-Za-z]+)>/g)].map((m) => `${m[1]} → ${m[2]}`)
  const persistKeys = [...src.matchAll(/name:\s*'(unq\.[A-Za-z0-9.]+)'/g)].map((m) => m[1])
  const idbi = idbInfo(src)
  const sk = storageKeys(lines.filter((_, i) => !mask[i]).join('\n'))
  const classes = classMethods(lines, mask)
  const doc = /^\s*(?:\/\/\s*(.+)|\/\*\*\s*([\s\S]*?)\*\/)/.exec(src.replace(/^(import[^\n]*\n)+\n?/, ''))
  const lead = (doc?.[1] ?? doc?.[2] ?? '').replace(/\s*\n\s*\*?\s*/g, ' ').trim()
  const shapes = stores.map((st) => { const n = st.split('→')[1].trim(); const b = interfaceBody(src, n); return b && b.length < 2600 ? b : null }).filter(Boolean)
  return { shapes, exports, deps: [...deps].sort(), ext: ext.sort(), stores, persistKeys, idbi, sk, classes, lead, lines: lines.length, hasJsx: file.endsWith('.tsx') }
}

export function generate() {
  const files = ROOTS.flatMap((r) => walk(r)).filter((f) => !isTest(f))
  const tests = ROOTS.flatMap((r) => walk(r)).filter(isTest)
  const byDir = new Map()
  for (const f of files) { const d = dirname(f); byDir.set(d, [...(byDir.get(d) ?? []), f]) }
  const out = []
  out.push('# 02 · Codebase Map (generated)', '', '> **Generated by `npm run docs:map` (`scripts/gen-codemap.mjs`). Do not hand-edit — edit `scripts/codemap-purposes.mjs` for purposes, then regenerate.**', '> `npm run verify:docs` fails if any `.ts/.tsx` file under `src/` or `functions/` is missing from this map, or if this map references a file that no longer exists.', '')
  out.push(`Source files: **${files.length}** · Test files: **${tests.length}**`, '')
  out.push('## Persistence inventory', '', '> Every browser storage location the app uses, detected from source (IndexedDB databases incl. const/param-default names, object stores, keyPaths, indexes; sessionStorage; localStorage).', '')
  const idbAll = [], lsAll = [], ssAll = []
  for (const f of files) {
    const a = analyse(f)
    for (const db of a.idbi.dbs) idbAll.push(`- \`${f}\` → IndexedDB database \`${db}\`${a.idbi.stores.length ? ' · object stores: ' + a.idbi.stores.map((st) => `\`${st.name}\` (keyPath: ${st.keyPath}${st.indexes.length ? '; indexes: ' + st.indexes.join(', ') : ''})`).join(', ') : ''}`)
    if (a.sk.local.length) lsAll.push(`- \`${f}\` → ${a.sk.local.map((k) => `\`${k}\``).join(', ')}`)
    if (a.sk.session.length) ssAll.push(`- \`${f}\` → ${a.sk.session.map((k) => `\`${k}\``).join(', ')}`)
  }
  out.push('**IndexedDB**', '', ...idbAll, '', '**sessionStorage (cleared when the tab closes — OAuth tokens live ONLY here)**', '', ...ssAll, '', '**localStorage**', '', ...lsAll, '')
  out.push('## Directory index', '')
  for (const d of [...byDir.keys()].sort()) out.push(`- \`${d}/\` — ${DIR_PURPOSES[d] ?? ''} (${byDir.get(d).length} files)`)
  out.push('')
  for (const d of [...byDir.keys()].sort()) {
    out.push(`## \`${d}/\``, '', DIR_PURPOSES[d] ?? '', '')
    for (const f of byDir.get(d)) {
      const a = analyse(f)
      const purpose = PURPOSES[f] ?? (a.lead && a.lead.length > 8 ? a.lead : null) ?? (a.exports.length ? '⚠ MISSING PURPOSE — add an entry to scripts/codemap-purposes.mjs' : 'Module side-effects / wiring.')
      out.push(`### \`${f}\``, '', `**Purpose:** ${purpose}  `, `**Size:** ${a.lines} lines${a.hasJsx ? ' · React component module' : ''}`, '')
      if (a.stores.length) { out.push(`**Zustand stores:** ${a.stores.map((s) => `\`${s}\``).join(', ')}`, ''); for (const sh of a.shapes) out.push('<details><summary>State shape</summary>', '', '```ts', sh, '```', '', '</details>', '') }
      if (a.exports.length) { out.push('**Exports:**', '', ...a.exports.map((e) => `- \`${e.sig.replace(/`/g, "'")}\``), '') } else out.push('**Exports:** none (side-effect / entry module)', '')
      for (const c of a.classes) if (c.methods.length) out.push(`**Public methods of \`${c.name}\`:**`, '', ...c.methods.map((m) => `- \`${m.replace(/`/g, "'")}\``), '')
      if (a.deps.length) out.push(`**Internal dependencies:** ${a.deps.map((x) => `\`${x}\``).join(', ')}`, '')
      if (a.ext.length) out.push(`**External packages:** ${a.ext.map((x) => `\`${x}\``).join(', ')}`, '')
    }
  }
  out.push('## Test files', '', ...tests.map((t) => `- \`${t}\``), '')
  out.push('## Other tracked entry points', '', '- `scripts/sync-catalog.mjs` — build-time 4-source Model Catalog snapshot (see DOCS/03); alias `npm run sync:models`.', '- `scripts/gen-seo-assets.mjs` — rewrites the canonical origin from `VITE_SITE_URL` (see DOCS/05).', '- `scripts/gen-brand-svgs.mjs` — regenerates `src/ui/icons/brandSvgs.ts` (see DOCS/04).', '- `scripts/gen-codemap.mjs` — generates this file.', '- `scripts/verify-docs.mjs` — doc-sync guard.', '- `scripts/e2e.mjs` — headless Chromium suite against the production `dist/`.', '')
  return out.join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(join(ROOT, 'DOCS/02-CODEBASE-MAP.md'), generate())
  console.log('DOCS/02-CODEBASE-MAP.md regenerated')
}
