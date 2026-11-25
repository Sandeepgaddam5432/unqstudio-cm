import { PROVIDERS, getProvider, type ProviderDef } from '@/core/ai/providers'
import { useSettings } from './settings'
import { getSecret, providerSecretName, vault } from './vault'

/** Built-in providers plus user-declared OpenAI-compatible providers from the plugin registry. */
export function allProviders(): ProviderDef[] {
  const plugins = useSettings.getState().plugins.providers.map<ProviderDef>((p) => ({
    id: `plugin:${p.id}`, name: p.name, kind: 'openai', baseUrl: p.baseUrl, models: p.models.map((id) => ({ id })), userModels: true, blurb: 'Custom provider from the plugin registry.',
  }))
  return [...PROVIDERS, ...plugins]
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
