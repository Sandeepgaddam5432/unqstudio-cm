// Doc-sync guard. Exits 1 when documentation is missing, empty, or out of sync with the source tree.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { ROOTS, walk, generate } from './gen-codemap.mjs'

const REQUIRED = ['AGENTS.md', 'CLAUDE.md', 'DOCS/01-SYSTEM-ARCHITECTURE.md', 'DOCS/02-CODEBASE-MAP.md', 'DOCS/03-MODELS-AND-AI-ENGINE.md', 'DOCS/04-UI-AND-DESIGN-SYSTEM.md', 'DOCS/05-AUTH-SEO-DEPLOY.md', 'DOCS/06-CHANGELOG-AND-ADRS.md', 'DOCS/07-VFS-RUNTIME-DEPLOY.md', 'DOCS/08-IMPROVEMENTS-AND-ROADMAP.md', 'DOCS/09-UIUX-MASTER-SPEC.md']
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

// ── v3.3.1: version & header consistency ────────────────────────────────────────────────────────────────────────
// package.json is the single source of truth; every status doc must carry the same version (no stale v2.1 / v3.2 headers).
if (existsSync('package.json')) {
  const ver = JSON.parse(readFileSync('package.json', 'utf8')).version
  const rd = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
  const h1 = (f) => (rd(f).split('\n').find((l) => /^# /.test(l)) ?? '')
  const needsVer = (f, line, label) => { if (!new RegExp(`v${ver.replace(/\./g, '\\.')}(?![\\w.])`).test(line)) problems.push(`VERSION MISMATCH: ${f} ${label} must mention v${ver} (package.json) — found: "${line.slice(0, 80)}"`) }
  needsVer('README.md', h1('README.md'), 'H1')
  needsVer('PROGRESS.md', h1('PROGRESS.md'), 'H1')
  needsVer('HANDOFF.md', rd('HANDOFF.md').split('\n').find((l) => /^\*\*State:\*\*/.test(l)) ?? '(no **State:** line)', '**State:** line')
  const firstChange = rd('CHANGELOG.md').split('\n').find((l) => /^## /.test(l)) ?? '(no ## heading)'
  needsVer('CHANGELOG.md', firstChange, 'first "## " heading (newest release)')
  const stale = (f, re) => { if (re.test(rd(f))) problems.push(`STALE header/footer in ${f}: matches ${re}`) }
  stale('HANDOFF.md', /\*\*State:\*\* V\d/)
  stale('README.md', /^# UnQStudio · v2\./m)
  stale('PROGRESS.md', /^# PROGRESS — UnQStudio v3\.2$/m)
  if (/in progress\)/i.test(firstChange)) problems.push('CHANGELOG.md newest heading still says "(in progress)" — publish or remove it')
}

// ── v3.3.1: strict git-diff doc-sync (Zero-Exception Micro-Change Rule) ────────────────────────────────────────
// ANY behavioural change under src/ functions/ scripts/ (tests excluded) — even one line — must ship with matching docs.
// Default: working tree vs HEAD (staged + unstaged + untracked). `--strict-diff[=<ref>]` also includes <ref>..HEAD (CI).
function gitChanges(strictRef) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' })
    const out = []
    const run = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean)
    for (const l of run(['status', '--porcelain', '-uall'])) { const x = l.slice(0, 2); const f = l.slice(3).replace(/^.* -> /, ''); out.push({ f, st: x.includes('?') || x.includes('A') ? 'A' : x.includes('D') ? 'D' : x.includes('R') ? 'R' : 'M' }) }
    if (strictRef) for (const l of run(['diff', '--name-status', `${strictRef}..HEAD`])) { const [st, ...r] = l.split('\t'); out.push({ f: r[r.length - 1], st: st[0] }) }
    return out
  } catch { return null }
}
{
  const arg = process.argv.find((a) => a.startsWith('--strict-diff'))
  const strictRef = arg ? (arg.split('=')[1] || 'HEAD~1') : null
  const ch = gitChanges(strictRef)
  if (ch) {
    const code = ch.filter((c) => /^(src|functions|scripts)\//.test(c.f) && !/\.test\.(ts|tsx)$/.test(c.f))
    if (code.length) {
      const touched = new Set(ch.map((c) => c.f))
      const must = ['DOCS/06-CHANGELOG-AND-ADRS.md', 'CHANGELOG.md', 'PROGRESS.md', 'HANDOFF.md']
      const structural = code.some((c) => (c.st === 'A' || c.st === 'D' || c.st === 'R') && /^(src|functions)\//.test(c.f))
      if (structural) must.push('DOCS/02-CODEBASE-MAP.md')
      const missing = must.filter((m) => !touched.has(m))
      if (missing.length) problems.push(`DOC-SYNC (git diff): ${code.length} code file(s) changed (${code.slice(0, 4).map((c) => c.f).join(', ')}${code.length > 4 ? ', …' : ''}) but these docs were NOT updated: ${missing.join(', ')}. Update them (and the topical DOCS/01,03,04,05,07,08,09 + scripts/codemap-purposes.mjs → npm run docs:map) before committing.`)
    }
  }
}
if (problems.length) { console.error('✗ verify:docs FAILED\n' + problems.map((p) => '  - ' + p).join('\n')); process.exit(1) }
console.log(`✓ verify:docs passed (${REQUIRED.length} docs present, code map in sync, versions consistent, git-diff doc-sync OK)`)
