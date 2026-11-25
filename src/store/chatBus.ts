import { create } from 'zustand'

export interface QueuedMessage { text: string; images?: string[]; mode?: 'build' | 'plan' | 'ask' }

/** Lets any part of the UI (preview error banner, inspector, command palette) hand a message to the chat. */
interface ChatBus {
  queued: QueuedMessage | null
  draft: string | null
  enqueue: (m: QueuedMessage) => void
  setDraft: (d: string | null) => void
  take: () => QueuedMessage | null
}

export const useChatBus = create<ChatBus>((set, get) => ({
  queued: null,
  draft: null,
  enqueue: (queued) => set({ queued }),
  setDraft: (draft) => set({ draft }),
  take: () => {
    const q = get().queued
    if (q) set({ queued: null })
    return q
  },
}))
