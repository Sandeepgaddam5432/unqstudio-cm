import { PROVIDERS, getProvider, setModelLookup, type ProviderDef } from '@/core/ai/providers'
import { REGISTRY_ALIAS, type RegProvider } from '@/core/ai/modelsDev'
import { catalogModels, type EnrichedModel, type FetchOutcome } from '@/core/ai/modelFetcher'
import { useModels } from './models'
import { useCustomProviders } from './customProviders'
import { parseHeaders, secretNames, toProviderDef } from '@/core/ai/customProviders'
import { useSettings } from './settings'
import { getSecret, providerSecretName, useVault, vault } from './vault'

/** A models.dev provider becomes a first-class provider immediately — the universal OpenAI-compatible adapter just uses its base URL. */
export function registryProviderToDef(rp: RegProvider): ProviderDef {
  return {
    id: rp.id, name: rp.name, kind: rp.kind, baseUrl: rp.api ?? '', models: [], userModels: true,
    local: rp.compat === 'local', noKey: rp.compat === 'local', keyUrl: rp.doc, doc: rp.doc, logo: rp.logo, compat: rp.compat, dynamic: true,
    blurb: `${rp.models.length} models · discovered via models.dev`,
  }
}

let memo: { reg: unknown; plug: unknown; cust: unknown; rev: number; out: ProviderDef[] } | null = null

/** Built-in providers + user plugin providers + EVERY provider discovered from the models.dev registry. */
export function allProviders(): ProviderDef[] {
  const reg = useModels.getState().registry
  const plug = useSettings.getState().plugins.providers
  const cust = useCustomProviders.getState().providers
  const rev = useVault.getState().rev
  if (memo && memo.reg === reg && memo.plug === plug && memo.cust === cust && memo.rev === rev) return memo.out
  const plugins = plug.map<ProviderDef>((p) => ({
    id: `plugin:${p.id}`, name: p.name, kind: 'openai', baseUrl: p.baseUrl, models: p.models.map((id) => ({ id })), userModels: true, compat: 'browser-ready', blurb: 'Custom provider from the plugin registry.',
  }))
  const builtins = PROVIDERS.map((p) => ({ ...p, compat: p.compat ?? (p.local ? 'local' as const : 'browser-ready' as const) }))
  const taken = new Set([...PROVIDERS.map((p) => p.id), ...Object.values(REGISTRY_ALIAS)])
  const dynamic = (reg?.providers ?? []).filter((p) => !taken.has(p.id)).map(registryProviderToDef)
  const customs = cust.map((c) => toProviderDef(c, parseHeaders(getSecret(secretNames(c.id).headers))))
  const out = [...builtins, ...customs, ...plugins, ...dynamic]
  memo = { reg, plug, cust, rev, out }
  return out
}

/** Built-ins default to enabled; registry-discovered providers are opt-in so the picker stays focused. */
export const isProviderEnabled = (p: ProviderDef): boolean => useSettings.getState().enabled[p.id] ?? !p.dynamic
export const providerHasKey = (p: ProviderDef): boolean => !!getSecret(providerSecretName(p.id))
/** "Configured ⭐": a saved key, or an explicitly enabled keyless/local provider. */
export const isConfigured = (p: ProviderDef): boolean => providerHasKey(p) || (!!p.noKey && useSettings.getState().enabled[p.id] === true)

export const registryProviderFor = (p: ProviderDef): RegProvider | undefined => {
  const id = REGISTRY_ALIAS[p.id] ?? p.id
  return useModels.getState().registry?.providers.find((x) => x.id === id)
}

/** Model list resolution: live `/models` (enriched) → models.dev catalog → built-in fallback; user-added IDs always appended. */
export function modelsForProvider(p: ProviderDef): EnrichedModel[] {
  const live = useModels.getState().live[p.id]
  const rp = registryProviderFor(p)
  const base: EnrichedModel[] = live?.status === 'ok' && live.models.length ? live.models
    : rp?.models.length ? catalogModels(rp)
    : p.models.map((m) => ({ id: m.id, name: m.label ?? m.id, vision: m.vision, reasoning: m.reasoning, cost: { input: m.priceIn, output: m.priceOut }, source: 'builtin' as const }))
  const have = new Set(base.map((m) => m.id))
  const custom = [...(useSettings.getState().userModels[p.id] ?? []), ...(p.custom ? p.models.map((m) => m.id) : [])].filter((id, i, a) => !have.has(id) && a.indexOf(id) === i).map<EnrichedModel>((id) => ({ id, name: id, source: 'custom' }))
  return [...base, ...custom]
}

/** Query the live /models endpoint for a provider using its saved (or explicitly supplied) key. */
export function fetchLiveFor(p: ProviderDef, o: { apiKey?: string; baseUrl?: string } = {}): Promise<FetchOutcome> {
  return useModels.getState().fetchLive({
    providerId: p.id,
    target: { id: p.id, kind: p.kind, baseUrl: p.baseUrl, noKey: p.noKey, headers: p.headers, browserAccess: p.browserAccess },
    apiKey: o.apiKey ?? getSecret(providerSecretName(p.id)),
    baseUrl: o.baseUrl ?? (useSettings.getState().baseUrls[p.id] || undefined),
    registryProvider: registryProviderFor(p),
  })
}

export const resolveProvider = (id: string): ProviderDef | undefined => getProvider(id) ?? allProviders().find((p) => p.id === id)

export interface ActiveConfig {
  provider: ProviderDef | undefined
  model: string
  apiKey?: string
  baseUrl?: string
  error?: 'nokey' | 'locked' | 'noprovider'
}

export function configFor(providerId: string, model?: string): ActiveConfig {
  const st = useSettings.getState()
  const provider = resolveProvider(providerId)
  if (!provider) return { provider, model: model ?? '', error: 'noprovider' }
  const baseUrl = st.baseUrls[provider.id] || undefined
  const apiKey = getSecret(providerSecretName(provider.id))
  const base = { provider, model: model ?? st.activeModel, apiKey, baseUrl }
  if (!provider.noKey && !apiKey) return { ...base, error: vault().locked ? 'locked' : 'nokey' }
  return base
}
export const activeConfig = (): ActiveConfig => configFor(useSettings.getState().activeProvider)

setModelLookup((pid, mid) => {
  const p = resolveProvider(pid)
  const m = p && modelsForProvider(p).find((x) => x.id === mid)
  return m ? { id: m.id, label: m.name, vision: m.vision, reasoning: m.reasoning, priceIn: m.cost?.input, priceOut: m.cost?.output } : undefined
})
