import { create } from 'zustand'
import { uid } from '@/lib/util'

export interface ToastItem {
  id: string
  kind: 'info' | 'success' | 'error'
  title: string
  description?: string
}

interface ToastState {
  items: ToastItem[]
  push: (t: Omit<ToastItem, 'id'>, ttl?: number) => void
  dismiss: (id: string) => void
}

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: (t, ttl = 4200) => {
    const id = uid('t')
    set((s) => ({ items: [...s.items.slice(-3), { ...t, id }] }))
    setTimeout(() => get().dismiss(id), t.kind === 'error' ? ttl * 1.8 : ttl)
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}))

export const toast = {
  info: (title: string, description?: string) => useToasts.getState().push({ kind: 'info', title, description }),
  success: (title: string, description?: string) => useToasts.getState().push({ kind: 'success', title, description }),
  error: (title: string, description?: string) => useToasts.getState().push({ kind: 'error', title, description }),
}
