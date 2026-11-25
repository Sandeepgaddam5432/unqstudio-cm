import { create } from 'zustand'
import { uid } from '@/lib/util'

export type EventCategory = 'ai' | 'compile' | 'error' | 'vfs' | 'deploy' | 'system'
export interface EventEntry { id: string; ts: number; category: EventCategory; message: string; durationMs?: number; data?: unknown }

interface EventsState {
  entries: EventEntry[]
  log: (category: EventCategory, message: string, extra?: { durationMs?: number; data?: unknown }) => void
  clear: () => void
}

export const useEvents = create<EventsState>((set) => ({
  entries: [],
  log: (category, message, extra) =>
    set((s) => ({ entries: [...s.entries.slice(-499), { id: uid('e'), ts: Date.now(), category, message, ...extra }] })),
  clear: () => set({ entries: [] }),
}))

export const logEvent = (category: EventCategory, message: string, extra?: { durationMs?: number; data?: unknown }) => useEvents.getState().log(category, message, extra)
