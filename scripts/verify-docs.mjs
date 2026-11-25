// Doc-sync guard. Exits 1 when documentation is missing, empty, or out of sync with the source tree.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { ROOTS, walk, generate } from './gen-codemap.mjs'

const REQUIRED = ['AGENTS.md', 'CLAUDE.md', 'DOCS/01-SYSTEM-ARCHITECTURE.md', 'DOCS/02-CODEBASE-MAP.md', 'DOCS/03-MODELS-AND-AI-ENGINE.md', 'DOCS/04-UI-AND-DESIGN-SYSTEM.md', 'DOCS/05-AUTH-SEO-DEPLOY.md', 'DOCS/06-CHANGELOG-AND-ADRS.md']
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
if (existsSync('DOCS/06-CHANGELOG-AND-ADRS.md') && !/## .*v2\.0/.test(readFileSync('DOCS/06-CHANGELOG-AND-ADRS.md', 'utf8'))) problems.push('DOCS/06-CHANGELOG-AND-ADRS.md has no v2.0 section')
if (problems.length) { console.error('✗ verify:docs FAILED\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1) }
console.log(`✓ verify:docs passed (${REQUIRED.length} docs present, code map in sync)`)
