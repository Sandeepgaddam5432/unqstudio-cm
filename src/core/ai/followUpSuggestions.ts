/** Deterministic, offline next-step suggestions shown as 1-tap chips after a successful build turn (no extra model call). */
export interface FollowUpInput {
  /** Text files of the project (path → content). */
  files: Record<string, string>
  /** Paths touched by the turn that just finished. */
  edited?: string[]
  /** Previously sent follow-up texts to avoid repeating. */
  exclude?: string[]
}

interface Rule { text: string; weight: number; when: (all: string, f: FollowUpInput) => boolean }

const RULES: Rule[] = [
  { text: 'Make it fully mobile responsive', weight: 100, when: (a) => !/\b(sm|md|lg):|@media|min-width|max-width/.test(a) },
  { text: 'Add a dark/light theme toggle', weight: 90, when: (a) => !/dark:|prefers-color-scheme|data-theme|toggleTheme|classList\.toggle\(['"]dark/.test(a) },
  { text: 'Add pricing & FAQ sections', weight: 85, when: (a) => /hero|landing|get started|features/i.test(a) && !/pricing/i.test(a) },
  { text: 'Add subtle micro-animations', weight: 80, when: (a) => !/transition|animate|@keyframes|framer-motion/.test(a) },
  { text: 'Add loading, empty and error states', weight: 70, when: (a) => /useState|fetch\(/.test(a) && !/loading|skeleton|empty/i.test(a) },
  { text: 'Persist the data in localStorage', weight: 66, when: (a) => /useState/.test(a) && !/localStorage/.test(a) },
  { text: 'Connect Supabase backend', weight: 60, when: (a) => !/supabase/i.test(a) },
  { text: 'Improve accessibility (labels, focus rings, contrast)', weight: 55, when: (a) => !/aria-|role=/.test(a) },
  { text: 'Polish spacing, typography and colour palette', weight: 40, when: () => true },
  { text: 'Add a search and filter bar', weight: 35, when: (a) => /\.map\(/.test(a) && !/search|filter/i.test(a) },
]

export function followUpSuggestions(input: FollowUpInput, max = 3): string[] {
  const src = Object.entries(input.files).filter(([p]) => /\.(tsx?|jsx?|css|html)$/.test(p) && !p.endsWith('.d.ts'))
  const all = src.map(([, c]) => c).join('\n')
  if (!all.trim()) return []
  const cssOnly = (input.edited?.length ?? 0) > 0 && input.edited!.every((p) => p.endsWith('.css'))
  const skip = new Set((input.exclude ?? []).map((s) => s.toLowerCase()))
  const scored = RULES.filter((r) => !skip.has(r.text.toLowerCase()) && r.when(all, input)).map((r) => ({ r, w: r.weight + (cssOnly && /responsive|animation/i.test(r.text) ? 6 : 0) }))
  scored.sort((a, b) => b.w - a.w || a.r.text.localeCompare(b.r.text))
  const out = scored.slice(0, max).map((s) => s.r.text)
  return out.length >= 2 ? out : [...out, 'Polish spacing, typography and colour palette'].filter((v, i, a) => a.indexOf(v) === i).slice(0, max)
}
