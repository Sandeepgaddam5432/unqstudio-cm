import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uniqueId, type CustomProvider } from '@/core/ai/customProviders'

type Draft = Omit<CustomProvider, 'id' | 'createdAt'>

interface CustomState {
  providers: CustomProvider[]
  /** Modal state (not persisted). `editingId` null + open → "new". */
  modalOpen: boolean
  editingId: string | null
  openNew: () => void
  openEdit: (id: string) => void
  closeModal: () => void
  add: (d: Draft) => CustomProvider
  update: (id: string, patch: Partial<Draft>) => void
  duplicate: (id: string) => CustomProvider | null
  remove: (id: string) => void
}

/** CRUD for user-defined providers. Persists ONLY non-secret fields to localStorage; keys & header values go to the Vault. */
export const useCustomProviders = create<CustomState>()(
  persist(
    (set, get) => ({
      providers: [],
      modalOpen: false,
      editingId: null,
      openNew: () => set({ modalOpen: true, editingId: null }),
      openEdit: (id) => set({ modalOpen: true, editingId: id }),
      closeModal: () => set({ modalOpen: false, editingId: null }),
      add: (d) => {
        const rec: CustomProvider = { ...d, id: uniqueId(d.name, get().providers.map((p) => p.id)), createdAt: Date.now() }
        set((s) => ({ providers: [...s.providers, rec] }))
        return rec
      },
      update: (id, patch) => set((s) => ({ providers: s.providers.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p)) })),
      duplicate: (id) => {
        const src = get().providers.find((p) => p.id === id)
        if (!src) return null
        const copy: CustomProvider = { ...src, name: `${src.name} (copy)`, id: uniqueId(`${src.name} copy`, get().providers.map((p) => p.id)), createdAt: Date.now(), models: [...src.models], headerNames: [...src.headerNames] }
        set((s) => ({ providers: [...s.providers, copy] }))
        return copy
      },
      remove: (id) => set((s) => ({ providers: s.providers.filter((p) => p.id !== id) })),
    }),
    { name: 'unq.customProviders.v1', version: 1, partialize: (s) => ({ providers: s.providers }) },
  ),
)
