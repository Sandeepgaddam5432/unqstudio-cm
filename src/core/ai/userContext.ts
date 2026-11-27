/**
 * Account-level personalization injected into every prompt (global Instructions, persistent Memory, enabled Skills).
 * Lives in core/ as a plain module so `prompts.ts` never imports from `store/` (layering: ui → store → core).
 */
export interface UserContext { instructions: string; memory: string[]; skills: { name: string; content: string }[]; /** Skills the user attached to THIS request with `/`. */ turnSkills?: { name: string; content: string }[] }
let ctx: UserContext = { instructions: '', memory: [], skills: [] }

export const setUserContext = (c: Partial<UserContext>) => { ctx = { ...ctx, ...c } }
export const getUserContext = (): UserContext => ctx

/** Markdown block for the system context ('' when the user has configured nothing). */
export function userContextBlock(c: UserContext = ctx): string {
  const parts: string[] = []
  if (c.instructions.trim()) parts.push(`### Global Instructions (the user's standing rules for every project)\n${c.instructions.trim().slice(0, 4000)}`)
  if (c.memory.length) parts.push(`### Memory (persistent facts about the user)\n${c.memory.slice(0, 40).map((m) => `- ${m.slice(0, 300)}`).join('\n')}`)
  if (c.skills.length) parts.push(`### Skills (reusable instructions)\n${c.skills.slice(0, 10).map((s) => `#### ${s.name}\n${s.content.slice(0, 2500)}`).join('\n\n')}`)
  if (c.turnSkills?.length) parts.push(`### Active skills for THIS request (the user attached these with /) — follow them strictly\n${c.turnSkills.slice(0, 6).map((s) => `#### ${s.name}\n${s.content.slice(0, 3000)}`).join('\n\n')}`)
  return parts.length ? parts.join('\n\n') + '\n\n' : ''
}
