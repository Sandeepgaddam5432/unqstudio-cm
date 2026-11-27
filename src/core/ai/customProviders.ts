import type { ProviderDef, ProviderKind } from './providers'
import { effectiveViaProxy } from '@/services/llm/urls'

/** Persisted (NON-secret) record of a user-defined provider. The API key and header values live in the encrypted Vault. */
export interface CustomProvider {
  id: string // `custom:<slug>`
  name: string
  kind: ProviderKind
  baseUrl: string
  /** Bundled brand glyph preset (src/ui/icons/brandSvgs.ts) + accent colour. */
  brand: string
  accent: string
  /** Manually added model IDs (for proxies that disable /models). */
  models: string[]
  noKey: boolean
  /** Anthropic wire only. */
  browserAccess: boolean
  /** v3.3: route via the UnQStudio CORS proxy. Undefined ⇒ default (ON for non-local https). */
  viaProxy?: boolean
  /** Header NAMES only, for display; values are vault secrets. */
  headerNames: string[]
  createdAt: number
}

export interface ProtocolInfo { kind: ProviderKind; label: string; hint: string; placeholder: string; modelsPath: string; chatPath: string }

export const PROTOCOLS: ProtocolInfo[] = [
  { kind: 'openai', label: 'OpenAI-Compatible', hint: 'Most gateways, proxies & clouds: POST /chat/completions (SSE).', placeholder: 'https://api.example.com/v1', modelsPath: 'GET {base}/models', chatPath: 'POST {base}/chat/completions' },
  { kind: 'anthropic', label: 'Anthropic Messages', hint: 'Claude-style POST /messages (SSE) with x-api-key.', placeholder: 'https://api.anthropic.com/v1', modelsPath: 'GET {base}/models', chatPath: 'POST {base}/messages' },
  { kind: 'gemini', label: 'Google Gemini Native', hint: 'Generative Language API: streamGenerateContent (SSE), thoughts, images.', placeholder: 'https://generativelanguage.googleapis.com', modelsPath: 'GET {base}/v1beta/models', chatPath: 'POST {base}/v1beta/models/{model}:streamGenerateContent' },
  { kind: 'ollama', label: 'Ollama Native', hint: 'Local or hosted Ollama: POST /api/chat (NDJSON), thinking & images.', placeholder: 'http://localhost:11434', modelsPath: 'GET {base}/api/tags', chatPath: 'POST {base}/api/chat' },
]
export const protocolInfo = (k: ProviderKind): ProtocolInfo => PROTOCOLS.find((p) => p.kind === k) ?? PROTOCOLS[0]!

export const BRAND_PRESETS = ['custom', 'openai', 'anthropic', 'gemini', 'meta', 'mistral', 'deepseek', 'groq', 'ollama', 'nvidia', 'huggingface', 'cohere'] as const
export const ACCENT_PRESETS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'] as const

export const slugify = (s: string): string => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'provider'

export function uniqueId(name: string, taken: Iterable<string>): string {
  const set = new Set(taken)
  const base = `custom:${slugify(name)}`
  if (!set.has(base)) return base
  for (let i = 2; ; i++) if (!set.has(`${base}-${i}`)) return `${base}-${i}`
}

export const secretNames = (id: string) => ({ key: `provider:${id}`, headers: `provider-headers:${id}` })

export function parseHeaders(json: string | undefined): Record<string, string> {
  if (!json) return {}
  try {
    const o = JSON.parse(json) as unknown
    if (!o || typeof o !== 'object') return {}
    return Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([k, v]) => k.trim() && typeof v === 'string')) as Record<string, string>
  } catch { return {} }
}

export function cleanHeaders(rows: { k: string; v: string }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { k, v } of rows) { const name = k.trim(); if (name && /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) out[name] = v.trim() }
  return out
}

export function validateCustomProvider(d: { name: string; baseUrl: string; kind: ProviderKind }): string | null {
  if (!d.name.trim()) return 'Give the provider a name.'
  try { const u = new URL(d.baseUrl.trim()); if (!/^https?:$/.test(u.protocol)) return 'Base URL must start with http:// or https://' } catch { return 'Enter a valid Base URL.' }
  return null
}

const LOCAL_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i

/** Materialise the runtime ProviderDef (vault-held headers are passed in). */
export function toProviderDef(c: CustomProvider, headers: Record<string, string> = {}): ProviderDef {
  return {
    id: c.id, name: c.name, kind: c.kind, baseUrl: c.baseUrl, models: c.models.map((id) => ({ id })), userModels: true, custom: true,
    noKey: c.noKey, local: LOCAL_RE.test(c.baseUrl), compat: LOCAL_RE.test(c.baseUrl) ? 'local' : 'browser-ready', brand: c.brand, accent: c.accent,
    browserAccess: c.kind === 'anthropic' ? c.browserAccess : undefined, headers: Object.keys(headers).length ? headers : undefined,
    viaProxy: effectiveViaProxy(c),
    blurb: `${protocolInfo(c.kind).label} · custom provider`,
  }
}
