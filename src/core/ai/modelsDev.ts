// Pure (import-free) models.dev normalizer. Shared by: scripts/sync-models-dev.mjs (build-time snapshot),
// functions/api/models-dev.ts (edge live sync) and the browser client (direct models.dev fallback).
// MUST stay dependency-free so the Node script can transpile + import it with esbuild.

export type Compat = 'browser-ready' | 'local' | 'requires-proxy'
export type WireKind = 'openai' | 'anthropic'

export interface RegModel {
  id: string
  name: string
  context?: number
  output?: number
  /** USD per 1M tokens. */
  cost?: { input?: number; output?: number }
  reasoning?: boolean
  vision?: boolean
  tool_call?: boolean
  modalities?: { input: string[]; output: string[] }
  release_date?: string
}

export interface RegProvider {
  id: string
  name: string
  /** OpenAI-compatible (or Anthropic) base URL; resolved from models.dev `api` or the KNOWN_API table. */
  api?: string
  doc?: string
  logo: string
  npm?: string
  env?: string[]
  kind: WireKind
  compat: Compat
  models: RegModel[]
}

export interface Registry {
  version: 1
  generatedAt: string
  source: string
  providers: RegProvider[]
}

/** models.dev omits `api` for first-party SDK providers; these are their public, CORS-friendly endpoints. */
export const KNOWN_API: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  xai: 'https://api.x.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  togetherai: 'https://api.together.xyz/v1',
  perplexity: 'https://api.perplexity.ai',
  cohere: 'https://api.cohere.ai/compatibility/v1',
  deepinfra: 'https://api.deepinfra.com/v1/openai',
  openrouter: 'https://openrouter.ai/api/v1',
  vercel: 'https://ai-gateway.vercel.sh/v1',
  venice: 'https://api.venice.ai/api/v1',
  deepseek: 'https://api.deepseek.com/v1',
}

/** Built-in provider id → models.dev provider id (built-ins keep their ids for stored keys). */
export const REGISTRY_ALIAS: Record<string, string> = {
  gemini: 'google',
  together: 'togetherai',
  fireworks: 'fireworks-ai',
  moonshot: 'moonshotai',
  github: 'github-models',
}

/** Server-IAM / signed-request platforms that cannot be called with a simple bearer key from a browser. */
const PROXY_RE = /(amazon-bedrock|google-vertex|^azure|watsonx|sap-ai-core|cloudflare-ai-gateway|gitlab|salad-cloud|qvac|merge-gateway)/
const LOCAL_HOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i

export function classifyProvider(id: string, npm?: string, api?: string): { compat: Compat; kind: WireKind; api?: string } {
  const base = api || KNOWN_API[id]
  const kind: WireKind = id === 'anthropic' || (npm ?? '').includes('anthropic') ? 'anthropic' : 'openai'
  if (id === 'ollama' || id === 'lmstudio' || (base && LOCAL_HOST_RE.test(base))) return { compat: 'local', kind, api: base }
  if (PROXY_RE.test(id) || PROXY_RE.test(npm ?? '')) return { compat: 'requires-proxy', kind, api: base }
  if (!base) return { compat: 'requires-proxy', kind, api: base }
  return { compat: 'browser-ready', kind, api: base }
}

interface RawModel {
  id?: string; name?: string; status?: string; reasoning?: boolean; tool_call?: boolean; release_date?: string
  limit?: { context?: number; output?: number }
  cost?: { input?: number; output?: number }
  modalities?: { input?: string[]; output?: string[] }
}
interface RawProvider { id?: string; name?: string; api?: string; doc?: string; npm?: string; env?: string[]; models?: Record<string, RawModel> }

export function normalizeModel(key: string, m: RawModel): RegModel | null {
  if (!m || m.status === 'deprecated') return null
  const out: RegModel = { id: m.id || key, name: m.name || m.id || key }
  if (m.limit?.context) out.context = m.limit.context
  if (m.limit?.output) out.output = m.limit.output
  if (m.cost && (m.cost.input != null || m.cost.output != null)) out.cost = { input: m.cost.input, output: m.cost.output }
  if (m.reasoning) out.reasoning = true
  if (m.modalities?.input?.includes('image')) out.vision = true
  if (m.tool_call) out.tool_call = true
  if (m.modalities) out.modalities = { input: m.modalities.input ?? [], output: m.modalities.output ?? [] }
  if (m.release_date) out.release_date = m.release_date
  return out
}

const LOCALS: RegProvider[] = [
  { id: 'ollama', name: 'Ollama (local)', api: 'http://localhost:11434/v1', doc: 'https://ollama.com', logo: 'https://models.dev/logos/ollama-cloud.svg', kind: 'openai', compat: 'local', models: [] },
  { id: 'lmstudio', name: 'LM Studio (local)', api: 'http://localhost:1234/v1', doc: 'https://lmstudio.ai', logo: 'https://models.dev/logos/lmstudio.svg', kind: 'openai', compat: 'local', models: [] },
]

/** Normalize the raw `https://models.dev/api.json` payload into the lean registry. Unknown / future providers just work. */
export function normalizeModelsDev(raw: unknown, opts: { source?: string; now?: Date } = {}): Registry {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, RawProvider>
  const providers: RegProvider[] = []
  for (const [key, p] of Object.entries(data)) {
    if (!p || typeof p !== 'object' || !p.models) continue
    const id = p.id || key
    const c = classifyProvider(id, p.npm, p.api)
    const models = Object.entries(p.models)
      .map(([k, m]) => normalizeModel(k, m))
      .filter((m): m is RegModel => !!m)
      .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? '') || a.name.localeCompare(b.name))
    const rp: RegProvider = { id, name: p.name || id, logo: `https://models.dev/logos/${id}.svg`, kind: c.kind, compat: c.compat, models }
    if (c.api) rp.api = c.api
    if (p.doc) rp.doc = p.doc
    if (p.npm) rp.npm = p.npm
    if (p.env?.length) rp.env = p.env
    providers.push(rp)
  }
  for (const l of LOCALS) if (!providers.some((p) => p.id === l.id)) providers.push(l)
  providers.sort((a, b) => a.name.localeCompare(b.name))
  return { version: 1, generatedAt: (opts.now ?? new Date()).toISOString(), source: opts.source ?? 'models.dev', providers }
}

/** True when `x` already has the normalized registry shape (edge function / bundled snapshot). */
export function isRegistry(x: unknown): x is Registry {
  return !!x && typeof x === 'object' && (x as Registry).version === 1 && Array.isArray((x as Registry).providers)
}

export const countModels = (r: Registry) => r.providers.reduce((n, p) => n + p.models.length, 0)
