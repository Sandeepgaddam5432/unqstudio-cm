import { openDB, type IDBPDatabase } from 'idb'
import { fuzzyScore } from '@/lib/fuzzy'

/** Reusable agent skills (markdown / JSON / text instructions) stored locally in IndexedDB database `unq-skills`. */
export interface Skill { id: string; name: string; content: string; enabled: boolean; createdAt: number }
let dbp: Promise<IDBPDatabase> | null = null
const db = () => (dbp ??= openDB('unq-skills', 1, { upgrade(d) { d.createObjectStore('skills', { keyPath: 'id' }) } }))

export async function listSkills(): Promise<Skill[]> { return ((await (await db()).getAll('skills')) as Skill[]).sort((a, b) => a.createdAt - b.createdAt) }
export async function saveSkill(s: Skill): Promise<void> { await (await db()).put('skills', s) }
export async function deleteSkill(id: string): Promise<void> { await (await db()).delete('skills', id) }

/** Turn an uploaded file into a Skill. JSON files may be `{name, content|instructions}`; anything else is used verbatim. */
export function parseSkillFile(fileName: string, text: string, now = Date.now()): Skill | null {
  const base = fileName.replace(/\.(md|markdown|json|txt)$/i, '') || 'Skill'
  let name = base
  let content = text
  if (/\.json$/i.test(fileName)) {
    try {
      const o = JSON.parse(text) as { name?: unknown; content?: unknown; instructions?: unknown }
      const c = typeof o.content === 'string' ? o.content : typeof o.instructions === 'string' ? o.instructions : null
      if (c === null) return null
      content = c
      if (typeof o.name === 'string' && o.name.trim()) name = o.name.trim()
    } catch { return null }
  }
  content = content.trim()
  if (!content) return null
  return { id: `skill_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name: name.slice(0, 60), content: content.slice(0, 20000), enabled: true, createdAt: now }
}

/** A skill the `/` menu can attach to a single request (built-in or installed). */
export interface SkillChoice { id: string; name: string; description: string; content: string; builtin: boolean }

export const BUILTIN_SKILLS: SkillChoice[] = [
  { id: 'builtin:fullstack-supabase', name: 'Full-stack Supabase', description: 'DB + Auth + CRUD + Realtime with a typed client', builtin: true, content: 'Build a REAL full-stack app: use Supabase (src/lib/supabase.ts typed client, VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), email Auth (sign up / sign in / sign out + protected routes), tables with Row Level Security, CRUD UI with optimistic updates and Realtime subscriptions. Also output the SQL migration the user must run.' },
  { id: 'builtin:responsive', name: 'Responsive polish', description: 'Mobile-first layout, no horizontal overflow', builtin: true, content: 'Make the UI mobile-first and fully responsive (390px → 1440px). No horizontal overflow, 44px touch targets, fluid type scale, safe-area padding.' },
  { id: 'builtin:a11y', name: 'Accessibility audit', description: 'WCAG AA: labels, focus, contrast, ARIA', builtin: true, content: 'Audit and fix accessibility: semantic landmarks, labelled controls, visible focus states, keyboard navigation, WCAG AA contrast, reduced-motion support, alt text.' },
  { id: 'builtin:seo', name: 'SEO optimizer', description: 'Meta tags, OpenGraph, semantic headings', builtin: true, content: 'Improve SEO: unique <title> and meta description, OpenGraph/Twitter tags, one h1, semantic headings, descriptive alt text, JSON-LD where relevant.' },
  { id: 'builtin:motion', name: 'Micro-interactions', description: 'Tasteful motion, hover and press states', builtin: true, content: 'Add tasteful micro-interactions: spring-eased hover/press feedback, staggered entrance, skeleton loading, and respect prefers-reduced-motion.' },
  { id: 'builtin:dark', name: 'Dark mode', description: 'Light/Dark themes with system preference', builtin: true, content: 'Add a polished dark mode using CSS variables, a system-preference default and a persisted toggle; verify contrast in both themes.' },
  { id: 'builtin:refactor', name: 'Refactor & clean', description: 'Smaller components, no dead code', builtin: true, content: 'Refactor for clarity: split large components, remove dead code, extract hooks and shared utilities, keep behaviour identical.' },
  { id: 'builtin:tests', name: 'Add tests', description: 'Vitest unit tests for the logic', builtin: true, content: 'Add focused Vitest unit tests for the core logic and critical UI states; keep them fast and deterministic.' },
]

export function skillChoices(installed: Skill[]): SkillChoice[] {
  const mine = installed.map((s): SkillChoice => ({ id: s.id, name: s.name, description: s.content.split('\n').find((l) => l.trim())?.slice(0, 80) ?? 'Installed skill', content: s.content, builtin: false }))
  return [...BUILTIN_SKILLS, ...mine]
}
/** Filter + rank skills for the `/` menu (empty query = everything). */
export function filterSkillChoices(items: SkillChoice[], q: string): SkillChoice[] {
  const query = q.trim().toLowerCase()
  if (!query) return items
  return items.map((s) => ({ s, sc: Math.max(fuzzyScore(query, s.name.toLowerCase()), fuzzyScore(query, s.description.toLowerCase()) - 20) })).filter((x) => x.sc >= 0).sort((a, b) => b.sc - a.sc).map((x) => x.s)
}
