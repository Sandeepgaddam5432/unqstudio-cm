import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const modelKey = (providerId: string, modelId: string) => `${providerId}::${modelId}`
export const RECENT_MAX = 3

interface PrefsState {
  favorites: string[]
  recents: string[]
  toggleFavorite: (providerId: string, modelId: string) => void
  isFavorite: (providerId: string, modelId: string) => boolean
  pushRecent: (providerId: string, modelId: string) => void
}

/** Starred models + the last 3 used, persisted in localStorage (`unq.modelPrefs.v1`). */
export const useModelPrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      favorites: [],
      recents: [],
      toggleFavorite: (p, m) => set((s) => { const k = modelKey(p, m); return { favorites: s.favorites.includes(k) ? s.favorites.filter((x) => x !== k) : [k, ...s.favorites] } }),
      isFavorite: (p, m) => get().favorites.includes(modelKey(p, m)),
      pushRecent: (p, m) => set((s) => { const k = modelKey(p, m); return { recents: [k, ...s.recents.filter((x) => x !== k)].slice(0, RECENT_MAX) } }),
    }),
    { name: 'unq.modelPrefs.v1', version: 1 },
  ),
)
