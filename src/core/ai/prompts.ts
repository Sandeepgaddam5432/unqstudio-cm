import { buildRepoMap, isMappable } from './repoMap'
import { isBinaryPath, isUnder, normalizePath, type VirtualFileSystem } from '@/core/vfs/vfs'
import type { AIMode } from '@/store/settings'

export const PROTOCOL = `## Output protocol (strict)
You modify the project ONLY by emitting these tags in your reply. Everything outside tags is shown to the user as chat text.

<create_file path="/src/components/Hero.tsx">
…complete file content…
</create_file>

<update_file path="/src/App.tsx">
…complete NEW content of the file (use only when most of the file changes)…
</update_file>

<patch_file path="/src/App.tsx">
<<<<<<< SEARCH
exact existing lines (copy them verbatim, include enough context to be unique)
=======
replacement lines
>>>>>>> REPLACE
</patch_file>

<delete_file path="/src/old.tsx" />

Rules:
- Paths are absolute from the project root and start with "/".
- PREFER <patch_file> for small/medium edits (it saves tokens and is faster). A patch may contain several SEARCH/REPLACE blocks. SEARCH text must match the current file exactly.
- Use <create_file> for new files and <update_file> only for large rewrites. Always write COMPLETE files – never "…rest unchanged" placeholders or TODO stubs.
- Never wrap file contents in markdown fences inside the tags.
- Files listed as LOCKED may not be modified, renamed or deleted. Work around them (e.g. create a new file) and tell the user.
- Before the tags write 1–3 short sentences about what you will do; after them write a brief summary (what changed, anything the user should know).
- You may think first inside <think>…</think>; it is shown collapsed.`

export const STACK = `## Project stack
- React 19 + TypeScript + Tailwind CSS v4 (utility classes; the stylesheet \`/src/index.css\` imports tailwindcss) compiled in the browser by esbuild; entry is \`/src/main.tsx\`, HTML shell is \`/index.html\`.
- Theme tokens are CSS variables (--accent, --bg, --surface, --fg, --muted, --line, --radius) exposed as Tailwind colors: bg-bg, bg-surface, text-fg, text-muted, border-line, bg-accent, text-accent-fg, rounded-theme. Prefer them so the Theme Studio keeps working. Dark mode uses the \`dark\` class.
- Any npm package can be imported directly (resolved from esm.sh in the preview), e.g. lucide-react, framer-motion, recharts, clsx, date-fns, zustand. Also add it to /package.json dependencies.
- The alias "@/" maps to "/src/". No server runtime: use client-side state, localStorage-like state and public APIs only.
- Build responsive, accessible, polished UIs: real copy, sensible spacing, hover/focus states, no lorem ipsum, no broken images (use inline SVG, gradients, or emoji instead of remote placeholder images unless known to exist).`

const BUILD_INTRO = `You are UnQStudio, an expert senior front-end engineer pair-programming inside a browser-based IDE. Implement the user's request by editing the project files. Make the app work on the first try: double-check imports, exports, types and JSX before you answer.`
const PLAN_INTRO = `You are UnQStudio in PLAN MODE. Do NOT write or modify files and do NOT emit any file tags. Produce a structured architecture blueprint in Markdown with these sections: "## Goal", "## UX & screens", "## Architecture" (components, state, data), "## File plan" (a table: path | purpose | new/modify), "## Steps" (numbered, ordered), "## Risks & open questions". Be concrete and concise. End by telling the user to press "Approve & Build" to implement it.`
const ASK_INTRO = `You are UnQStudio in ASK MODE. Answer questions about the project and web engineering clearly and concisely. Do NOT modify files and do NOT emit file tags; use normal markdown code fences for any snippets.`

export function systemInstructions(mode: AIMode, customPrompts: string[] = []): string {
  const intro = mode === 'build' ? BUILD_INTRO : mode === 'plan' ? PLAN_INTRO : ASK_INTRO
  const parts = [intro]
  if (mode === 'build') parts.push(PROTOCOL)
  parts.push(STACK)
  if (customPrompts.length) parts.push('## User rules (always follow)\n' + customPrompts.map((p, i) => `${i + 1}. ${p.trim()}`).join('\n'))
  return parts.join('\n\n')
}

export const ENHANCER_SYSTEM = `You rewrite vague app ideas into rich, structured prompts for an AI web-app builder. Keep the user's intent. Output ONLY the improved prompt (no preamble, no quotes, no markdown fences), 120–220 words, containing: the product & audience, key screens/sections, specific features and interactions, visual style (palette, typography, spacing, tone — modern, minimal, polished), responsive + accessibility expectations, and sample realistic content to use. Stack: React + TypeScript + Tailwind (client-side only).`

/* ── project context ─────────────────────────────────────── */
export interface ContextOptions { pinned?: string[]; mentioned?: string[]; includeAll?: boolean; budgetChars?: number; perFileChars?: number; /** Share of the budget non-priority files may use as FULL text before falling back to the symbol map (default 0.4). */ fullShare?: number; /** Disable the Project Symbol Map (default on). */ symbolMap?: boolean }
export interface ContextFile { path: string; chars: number; lines: number; included: boolean; truncated: boolean; locked: boolean; /** Content replaced by a symbol-map line. */ mapped?: boolean }

/** Files whose FULL text is always sent (when present): the app entry points. */
/** Max characters of Project Knowledge injected per turn. */
export const KNOWLEDGE_MAX = 8_000

export const ENTRY_FILES = ['/index.html', '/src/main.tsx', '/src/main.ts', '/src/main.jsx', '/src/App.tsx', '/src/App.jsx', '/src/index.tsx']

const SKIP_CONTENT = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.keep|\.gitignore)$/

export function buildProjectContext(vfs: VirtualFileSystem, opts: ContextOptions = {}): { text: string; files: ContextFile[] } {
  const budget = opts.budgetChars ?? 70_000
  const perFile = opts.perFileChars ?? 14_000
  const all = vfs.paths().filter((p) => !p.endsWith('/.keep'))
  const priority = new Set([...(opts.pinned ?? []), ...(opts.mentioned ?? [])])
  const entry = new Set(ENTRY_FILES.filter((p) => all.includes(p)))
  const useMap = opts.symbolMap !== false
  const fullBudget = Math.floor(budget * (opts.fullShare ?? 0.4))
  const mapEntries: { path: string; content: string }[] = []
  const rank = (p: string) => (priority.has(p) ? 0 : entry.has(p) ? 1 : p.startsWith('/src/') ? 2 : 3)
  const ordered = [...all].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  let used = 0
  const files: ContextFile[] = []
  let body = ''
  for (const p of ordered) {
    const rec = vfs.getRecord(p)!
    const locked = vfs.isLocked(p)
    const binary = rec.encoding !== 'utf8' || isBinaryPath(p)
    const lines = binary ? 0 : rec.content.split('\n').length
    const wanted = !binary && !SKIP_CONTENT.test(p) && (priority.has(p) || opts.includeAll !== false)
    let included = false
    let truncated = false
    if (wanted) {
      let c = rec.content
      if (c.length > perFile) { c = c.slice(0, perFile) + '\n/* …truncated… */'; truncated = true }
      const must = priority.has(p) || entry.has(p)
      const cap = useMap ? fullBudget : budget
      if (must ? (used + c.length <= budget || priority.has(p)) : used + c.length <= cap) {
        body += `\n--- ${p}${locked ? ' [LOCKED]' : ''} ---\n${c}\n`
        used += c.length
        included = true
      }
    }
    const mapped = useMap && !included && !binary && isMappable(p)
    if (mapped) mapEntries.push({ path: p, content: rec.content })
    files.push({ path: p, chars: rec.content.length, lines, included, truncated, locked, mapped })
  }
  const tree = files.map((f) => `${f.path}${f.locked ? ' [LOCKED]' : ''}${f.lines ? ` (${f.lines} lines)` : ''}${!f.included && f.lines ? (f.mapped ? ' (in symbol map)' : ' (content omitted)') : ''}`).join('\n')
  const map = mapEntries.length ? buildRepoMap(mapEntries) : null
  const locks = vfs.getLocks()
  const text =
    `## Project: ${vfs.meta.name}\n` +
    (vfs.meta.knowledge?.trim() ? `### Project Knowledge (the author's standing instructions — follow them on every turn)\n${vfs.meta.knowledge.trim().slice(0, KNOWLEDGE_MAX)}\n\n` : '') +
    `### File tree\n${tree || '(empty project)'}\n` +
    (locks.length ? `\n### LOCKED paths (do not modify)\n${locks.join('\n')}\n` : '') +
    (map ? `\n### Project symbol map (files whose full text is omitted; @mention a file or ask to see it before editing it)\n${map.text}\n` : '') +
    `\n### File contents${body || '\n(none)'}`
  return { text, files }
}

/** Resolve `@path`, `@folder` and `@basename` mentions to project files. */
export function extractMentions(text: string, paths: string[]): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/(?:^|\s)@([\w@./\-[\]]+)/g)) {
    const raw = m[1].replace(/[.,;:!?)]+$/, '')
    const cand = normalizePath(raw)
    if (paths.includes(cand)) { out.add(cand); continue }
    const under = paths.filter((p) => isUnder(p, cand) && p !== cand)
    if (under.length) { under.forEach((p) => out.add(p)); continue }
    const byBase = paths.filter((p) => p.endsWith('/' + raw) || p.split('/').pop() === raw)
    if (byBase.length === 1) out.add(byBase[0])
  }
  return [...out]
}
