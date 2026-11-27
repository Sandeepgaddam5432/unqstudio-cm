import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setUserContext } from '@/core/ai/userContext'
import { listSkills, type Skill } from '@/core/skills'
import { toast } from '@/store/toast'

export type Perm = 'allow' | 'ask' | 'deny'
export type PermKey = 'projectEdits' | 'publishing' | 'build' | 'connectors'
export const PERM_ROWS: { key: PermKey; label: string; desc: string }[] = [
  { key: 'projectEdits', label: 'Project edits from chat', desc: 'Let the agent create and change files when you send a Build message.' },
  { key: 'publishing', label: 'Publishing', desc: 'Opening the Publish sheet to deploy, export or push.' },
  { key: 'build', label: 'Build / Auto-heal', desc: 'Automatic follow-up turns that fix build and runtime errors.' },
  { key: 'connectors', label: 'Connectors', desc: 'Using connected services (GitHub, Supabase, hosts) from the agent.' },
]
export const LANGUAGES = ['English', 'Español', 'Français', 'Deutsch', 'Português', '日本語', '中文', 'हिन्दी', 'తెలుగు']

export interface PrefsData {
  language: string
  suggestions: boolean
  tips: boolean
  messageQueue: boolean
  completeSound: boolean
  permissions: Record<PermKey, Perm>
  instructions: string
  memory: string[]
}
export const DEFAULT_PREFS: PrefsData = {
  language: 'English', suggestions: true, tips: true, messageQueue: true, completeSound: false,
  permissions: { projectEdits: 'allow', publishing: 'allow', build: 'allow', connectors: 'allow' }, instructions: '', memory: [],
}

interface PrefsState extends PrefsData {
  skills: Skill[]
  set: (p: Partial<PrefsData>) => void
  setPerm: (k: PermKey, v: Perm) => void
  addMemory: (text: string) => void
  removeMemory: (i: number) => void
  loadSkills: () => Promise<void>
  setSkills: (s: Skill[]) => void
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFS,
      skills: [],
      set: (p) => set(p),
      setPerm: (k, v) => set({ permissions: { ...get().permissions, [k]: v } }),
      addMemory: (text) => { const t = text.trim(); if (t) set({ memory: [...get().memory, t.slice(0, 300)] }) },
      removeMemory: (i) => set({ memory: get().memory.filter((_, j) => j !== i) }),
      loadSkills: async () => { try { set({ skills: await listSkills() }) } catch { /* IndexedDB unavailable */ } },
      setSkills: (skills) => set({ skills }),
    }),
    { name: 'unq.prefs', partialize: (s): PrefsData => ({ language: s.language, suggestions: s.suggestions, tips: s.tips, messageQueue: s.messageQueue, completeSound: s.completeSound, permissions: s.permissions, instructions: s.instructions, memory: s.memory }) },
  ),
)

const sync = () => { const s = usePrefs.getState(); setUserContext({ instructions: s.instructions, memory: s.memory, skills: s.skills.filter((k) => k.enabled).map((k) => ({ name: k.name, content: k.content })) }) }
usePrefs.subscribe(sync)
sync()

/** Agent permission gate: `deny` blocks with a toast, `ask` asks for confirmation each time, `allow` passes. */
export function gate(key: PermKey, action: string, confirmFn: (m: string) => boolean = (m) => (typeof window === 'undefined' ? true : window.confirm(m))): boolean {
  const p = usePrefs.getState().permissions[key]
  if (p === 'deny') { toast.error('Blocked by permissions', `${action} is set to Deny in Account settings → Permissions.`); return false }
  if (p === 'ask') return confirmFn(`Allow: ${action}?`)
  return true
}

/** Subtle two-note Web Audio chime for "generation complete" (silent where Web Audio is unavailable). */
export function playChime() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ac = new AC()
    const t = ac.currentTime
    ;[660, 880].forEach((f, i) => {
      const o = ac.createOscillator(); const g = ac.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t + i * 0.13); g.gain.exponentialRampToValueAtTime(0.06, t + i * 0.13 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.13 + 0.35)
      o.connect(g).connect(ac.destination); o.start(t + i * 0.13); o.stop(t + i * 0.13 + 0.4)
    })
    setTimeout(() => void ac.close(), 900)
  } catch { /* autoplay policy / unsupported */ }
}
