import { create } from 'zustand'
import type { SkillChoice } from '@/core/skills'

/** Skills attached to the NEXT request via the `/` menu (Home hero + workspace composer). Consumed by `chat.send`. */
interface ComposerSkillsState {
  picked: SkillChoice[]
  add: (s: SkillChoice) => void
  remove: (id: string) => void
  /** Return and clear the attached skills (called once per user send). */
  take: () => SkillChoice[]
}
export const useComposerSkills = create<ComposerSkillsState>()((set, get) => ({
  picked: [],
  add: (s) => set((st) => (st.picked.some((p) => p.id === s.id) ? st : { picked: [...st.picked, s].slice(0, 6) })),
  remove: (id) => set((st) => ({ picked: st.picked.filter((p) => p.id !== id) })),
  take: () => { const p = get().picked; if (p.length) set({ picked: [] }); return p },
}))
