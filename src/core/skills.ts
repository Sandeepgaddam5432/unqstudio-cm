import { openDB, type IDBPDatabase } from 'idb'

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
