// Doc-sync guard. Exits 1 when documentation is missing, empty, or out of sync with the source tree.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { ROOTS, walk, generate } from './gen-codemap.mjs'

const REQUIRED = ['AGENTS.md', 'CLAUDE.md', 'DOCS/01-SYSTEM-ARCHITECTURE.md', 'DOCS/02-CODEBASE-MAP.md', 'DOCS/03-MODELS-AND-AI-ENGINE.md', 'DOCS/04-UI-AND-DESIGN-SYSTEM.md', 'DOCS/05-AUTH-SEO-DEPLOY.md', 'DOCS/06-CHANGELOG-AND-ADRS.md', 'DOCS/07-VFS-RUNTIME-DEPLOY.md', 'DOCS/08-IMPROVEMENTS-AND-ROADMAP.md']
const problems = []
for (const f of REQUIRED) {
  if (!existsSync(f)) problems.push(`MISSING required doc: ${f}`)
  else if (statSync(f).size < 200) problems.push(`EMPTY/too small doc: ${f}`)
}
if (existsSync('DOCS/02-CODEBASE-MAP.md')) {
  const map = readFileSync('DOCS/02-CODEBASE-MAP.md', 'utf8')
  const files = ROOTS.flatMap((r) => walk(r)).filter((f) => !/\.test\.(ts|tsx)$/.test(f))
  for (const f of files) if (!map.includes(`\`${f}\``)) problems.push(`UNDOCUMENTED file (not in DOCS/02-CODEBASE-MAP.md): ${f}`)
  const all = new Set(ROOTS.flatMap((r) => walk(r)))
  for (const m of map.matchAll(/`((?:src|functions)\/[A-Za-z0-9_./\-[\]]+\.(?:ts|tsx))`/g)) if (!all.has(m[1])) problems.push(`STALE reference in DOCS/02-CODEBASE-MAP.md (file no longer exists): ${m[1]}`)
  if (map.trim() !== generate().trim()) problems.push('DOCS/02-CODEBASE-MAP.md is out of date vs. the current exports/imports — run `npm run docs:map`')
}
if (existsSync('DOCS/02-CODEBASE-MAP.md')) {
  const map = readFileSync('DOCS/02-CODEBASE-MAP.md', 'utf8')
  const lazy = [...map.matchAll(/\*\*Purpose:\*\* (Defines |⚠ MISSING|Defines\.)/g)].length
  if (lazy) problems.push(`DOCS/02-CODEBASE-MAP.md contains ${lazy} lazy "**Purpose:** Defines …" / missing purposes — write a real one in scripts/codemap-purposes.mjs`)
  if (/Module side-effects \/ wirin/.test(map) && /\*\*Purpose:\*\* Module side-effects/.test(map)) problems.push('DOCS/02-CODEBASE-MAP.md contains a generic "Module side-effects" purpose')
}
// DOCS/04 must name every postMessage event of the preview bridge (single source of truth: bridgeScript.ts header).
if (existsSync('src/core/runtime/bridgeScript.ts') && existsSync('DOCS/04-UI-AND-DESIGN-SYSTEM.md')) {
  const hdr = readFileSync('src/core/runtime/bridgeScript.ts', 'utf8').split('\n').filter((l) => /iframe → host|host → iframe/.test(l)).join(' ')
  const names = [...new Set([...hdr.matchAll(/\b([a-z]+(?::[a-z]+|-[a-z]+)?)\b(?=,|\s*$|\s)/g)].map((m) => m[1]))].filter((n) => /^(console|error|resource-error|ready|inspect:select|screenshot|inspect:enable|inspect:apply|theme|theme-css)$/.test(n))
  const d4 = readFileSync('DOCS/04-UI-AND-DESIGN-SYSTEM.md', 'utf8')
  for (const n of names) if (!d4.includes('`' + n + '`')) problems.push(`DOCS/04 does not document bridge message \`${n}\``)
}
for (const f of ['DOCS/05-AUTH-SEO-DEPLOY.md', 'DOCS/DEPLOYMENT.md']) if (existsSync(f) && !readFileSync(f, 'utf8').includes('VITE_SITE_URL')) problems.push(`${f} must document VITE_SITE_URL`)
if (existsSync('DOCS/06-CHANGELOG-AND-ADRS.md') && !/## .*v2\.0/.test(readFileSync('DOCS/06-CHANGELOG-AND-ADRS.md', 'utf8'))) problems.push('DOCS/06-CHANGELOG-AND-ADRS.md has no v2.0 section')
if (problems.length) { console.error('✗ verify:docs FAILED\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1) }
console.log(`✓ verify:docs passed (${REQUIRED.length} docs present, code map in sync)`)
