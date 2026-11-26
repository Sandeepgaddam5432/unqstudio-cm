import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { loadRegistry, type RegistrySource } from '@/core/ai/modelsRegistry'
import { fetchLiveModels, type EnrichedModel, type FetchOutcome, type LiveTarget } from '@/core/ai/modelFetcher'
import type { Registry, RegProvider } from '@/core/ai/modelsDev'

export interface LiveState {
  status: 'idle' | 'loading' | 'ok' | 'error'
  models: EnrichedModel[]
  error?: string
  fetchedAt?: number
}

interface ModelsState {
  registry: Registry | null
  registrySource: RegistrySource | null
  syncedAt: number | null
  registryStatus: 'idle' | 'loading' | 'ready' | 'error'
  registryError?: string
  live: Record<string, LiveState>
  loadRegistry: (force?: boolean) => Promise<void>
  fetchLive: (a: { providerId: string; target: LiveTarget & { noKey?: boolean }; apiKey?: string; baseUrl?: string; registryProvider?: RegProvider }) => Promise<FetchOutcome>
}

export const useModels = create<ModelsState>()(
  persist(
    (set) => ({
      registry: null,
      registrySource: null,
      syncedAt: null,
      registryStatus: 'idle',
      live: {},
      loadRegistry: async (force = false) => {
        set({ registryStatus: 'loading', registryError: undefined })
        try {
          const r = await loadRegistry({ force })
          set({ registry: r.data, registrySource: r.source, syncedAt: r.fetchedAt, registryStatus: 'ready' })
        } catch (e) { set({ registryStatus: 'error', registryError: e instanceof Error ? e.message : String(e) }) }
      },
      fetchLive: async ({ providerId, target, apiKey, baseUrl, registryProvider }) => {
        set((s) => ({ live: { ...s.live, [providerId]: { ...(s.live[providerId] ?? { models: [] }), status: 'loading', error: undefined } } }))
        const out = await fetchLiveModels({ provider: target, apiKey, baseUrl, registryProvider })
        set((s) => ({
          live: { ...s.live, [providerId]: out.ok
            ? { status: 'ok', models: out.models, fetchedAt: Date.now() }
            : { status: 'error', models: s.live[providerId]?.models ?? [], error: out.error, fetchedAt: Date.now() } },
        }))
        return out
      },
    }),
    {
      name: 'unq.models.v1',
      version: 1,
      partialize: (s) => ({ live: Object.fromEntries(Object.entries(s.live).filter(([, v]) => v.status === 'ok')) }),
    },
  ),
)
