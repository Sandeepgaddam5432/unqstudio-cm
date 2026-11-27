import { create } from 'zustand'
import { CUSTOM_KINDS, EXTRA_CONNECTORS, type ConnectorCategory, type ConnectorDef, type CustomConnector, type CustomKind } from '@/core/connectors'
import { SERVICES, connSecretName } from './connections'
import { getSecret, useVault } from './vault'

const K = 'unq.connectors.v1'
const BRAND: Record<string, string> = { github: 'github', gitlab: 'gitlab', cloudflare: 'cloudflarepages', netlify: 'netlify', vercel: 'vercel', supabase: 'supabase' }
const CAT: Record<string, ConnectorCategory> = { github: 'Build', gitlab: 'Build', cloudflare: 'Deploy', netlify: 'Deploy', vercel: 'Deploy', supabase: 'Data' }

/** All built-in connectors: the six deploy/data services (credentials shared with Publish) + the extra brands. */
export function connectorDefs(): ConnectorDef[] {
  const base = SERVICES.map((s): ConnectorDef => ({ id: s.id, name: s.name, brand: BRAND[s.id] ?? 'custom', category: CAT[s.id] ?? 'Build', blurb: s.blurb, help: s.help, fields: s.fields }))
  return [...base, ...EXTRA_CONNECTORS]
}
export const connectorValues = (id: string): Record<string, string> => {
  const def = connectorDefs().find((d) => d.id === id); const out: Record<string, string> = {}
  for (const f of def?.fields ?? []) { const v = getSecret(connSecretName(id as never, f.key)); if (v) out[f.key] = v }
  return out
}
export const isConnectorConnected = (id: string): boolean => {
  const def = connectorDefs().find((d) => d.id === id); const v = connectorValues(id)
  return !!def && def.fields.filter((f) => !f.optional).every((f) => !!v[f.key])
}

interface State {
  custom: CustomConnector[]
  disabled: Record<string, boolean>
  rev: number
  setEnabled: (id: string, on: boolean) => void
  isEnabled: (id: string) => boolean
  save: (id: string, values: Record<string, string>) => Promise<boolean>
  disconnect: (id: string) => Promise<void>
  addCustom: (c: { name: string; kind: CustomKind; url: string; header: string; secret: string }) => Promise<CustomConnector | null>
  removeCustom: (id: string) => Promise<void>
}
const load = (): { custom: CustomConnector[]; disabled: Record<string, boolean> } => { try { const o = JSON.parse(localStorage.getItem(K) ?? '{}'); return { custom: Array.isArray(o.custom) ? o.custom : [], disabled: o.disabled && typeof o.disabled === 'object' ? o.disabled : {} } } catch { return { custom: [], disabled: {} } } }
const persist = (s: { custom: CustomConnector[]; disabled: Record<string, boolean> }) => { try { localStorage.setItem(K, JSON.stringify({ custom: s.custom, disabled: s.disabled })) } catch { /* private mode */ } }

export const useConnectors = create<State>()((set, get) => ({
  ...load(),
  rev: 0,
  setEnabled: (id, on) => { const disabled = { ...get().disabled, [id]: !on }; if (on) delete disabled[id]; set({ disabled }); persist(get()) },
  isEnabled: (id) => !get().disabled[id],
  save: async (id, values) => {
    const v = useVault.getState()
    if (v.locked) { v.setUnlockOpen(true); return false }
    const def = connectorDefs().find((d) => d.id === id)
    for (const f of def?.fields ?? []) if (values[f.key]?.trim()) await v.setSecret(connSecretName(id as never, f.key), values[f.key]!.trim())
    set({ rev: get().rev + 1 }); return true
  },
  disconnect: async (id) => {
    const v = useVault.getState(); const def = connectorDefs().find((d) => d.id === id)
    for (const f of def?.fields ?? []) await v.removeSecret(connSecretName(id as never, f.key))
    set({ rev: get().rev + 1 })
  },
  addCustom: async ({ name, kind, url, header, secret }) => {
    const v = useVault.getState()
    if (secret && v.locked) { v.setUnlockOpen(true); return null }
    const c: CustomConnector = { id: `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: name.trim().slice(0, 60), kind, url: url.trim(), header: header.trim() || 'Authorization', enabled: true }
    if (secret) await v.setSecret(connSecretName(c.id as never, 'header'), secret)
    set({ custom: [...get().custom, c], rev: get().rev + 1 }); persist(get()); return c
  },
  removeCustom: async (id) => { await useVault.getState().removeSecret(connSecretName(id as never, 'header')); set({ custom: get().custom.filter((c) => c.id !== id), rev: get().rev + 1 }); persist(get()) },
}))
export const customSecret = (id: string): string => getSecret(connSecretName(id as never, 'header')) ?? ''
export const kindLabel = (k: CustomKind): string => CUSTOM_KINDS.find((x) => x.value === k)?.label ?? k
