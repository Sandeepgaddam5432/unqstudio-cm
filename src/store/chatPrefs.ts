import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Density = 'compact' | 'comfortable'
export type ChatFont = 'small' | 'medium' | 'large'

export interface ChatPrefs {
  density: Density
  fontSize: ChatFont
  autoExpandThink: boolean
  showBadges: boolean
  showActivity: boolean
  autoScroll: boolean
}

export const DEFAULT_CHAT_PREFS: ChatPrefs = {
  density: 'comfortable', fontSize: 'medium', autoExpandThink: false, showBadges: true, showActivity: true, autoScroll: true,
}

export const CHAT_FONT_PX: Record<ChatFont, number> = { small: 12.5, medium: 13.5, large: 15 }

interface ChatPrefsState extends ChatPrefs {
  setPref: <K extends keyof ChatPrefs>(k: K, v: ChatPrefs[K]) => void
  reset: () => void
}

/** Chat customization (persisted in localStorage through Zustand `persist`). */
export const useChatPrefs = create<ChatPrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_CHAT_PREFS,
      setPref: (k, v) => set({ [k]: v } as Partial<ChatPrefs>),
      reset: () => set({ ...DEFAULT_CHAT_PREFS }),
    }),
    { name: 'unq.chatprefs.v1', version: 1 },
  ),
)
