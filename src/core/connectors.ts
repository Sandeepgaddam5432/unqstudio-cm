import type { ServiceField } from '@/store/connections'

/** Connector catalogue entries beyond the six deploy services (those live in `store/connections.ts`). Pure data + checks (no store imports at runtime). */
export type ConnectorCategory = 'Build' | 'Deploy' | 'Data' | 'AI' | 'Services'
export interface ConnectorDef { id: string; name: string; brand: string; category: ConnectorCategory; blurb: string; help: string; fields: ServiceField[] }

export const EXTRA_CONNECTORS: ConnectorDef[] = [
  { id: 'firebase', name: 'Firebase', brand: 'firebase', category: 'Data', blurb: 'Firestore, Auth and Storage for realtime apps.', help: 'https://console.firebase.google.com/', fields: [{ key: 'apiKey', label: 'Web API key', secret: true, placeholder: 'AIza…' }, { key: 'projectId', label: 'Project ID' }] },
  { id: 'neon', name: 'Neon', brand: 'neon', category: 'Data', blurb: 'Serverless Postgres with branching.', help: 'https://console.neon.tech/app/settings/api-keys', fields: [{ key: 'apiKey', label: 'API key', secret: true }] },
  { id: 'upstash', name: 'Upstash', brand: 'upstash', category: 'Data', blurb: 'Serverless Redis & Kafka over REST.', help: 'https://console.upstash.com/', fields: [{ key: 'url', label: 'REST URL', placeholder: 'https://…upstash.io' }, { key: 'token', label: 'REST token', secret: true }] },
  { id: 'stripe', name: 'Stripe', brand: 'stripe', category: 'Services', blurb: 'Payments, subscriptions and checkout.', help: 'https://dashboard.stripe.com/apikeys', fields: [{ key: 'publishableKey', label: 'Publishable key', placeholder: 'pk_test_…' }] },
  { id: 'resend', name: 'Resend', brand: 'resend', category: 'Services', blurb: 'Transactional email for your app.', help: 'https://resend.com/api-keys', fields: [{ key: 'apiKey', label: 'API key', secret: true, placeholder: 're_…' }] },
  { id: 'clerk', name: 'Clerk', brand: 'clerk', category: 'Services', blurb: 'Drop-in authentication and user management.', help: 'https://dashboard.clerk.com/', fields: [{ key: 'publishableKey', label: 'Publishable key', placeholder: 'pk_test_…' }] },
  { id: 'openai', name: 'OpenAI', brand: 'openai', category: 'AI', blurb: 'GPT models for features inside your generated apps.', help: 'https://platform.openai.com/api-keys', fields: [{ key: 'apiKey', label: 'API key', secret: true, placeholder: 'sk-…' }] },
  { id: 'anthropic', name: 'Anthropic', brand: 'anthropic', category: 'AI', blurb: 'Claude models for features inside your generated apps.', help: 'https://console.anthropic.com/settings/keys', fields: [{ key: 'apiKey', label: 'API key', secret: true, placeholder: 'sk-ant-…' }] },
]

export type CustomKind = 'rest' | 'webhook' | 'mcp'
export const CUSTOM_KINDS: { value: CustomKind; label: string; hint: string }[] = [
  { value: 'rest', label: 'REST API', hint: 'GET reachability check' },
  { value: 'webhook', label: 'Webhook', hint: 'POST ping' },
  { value: 'mcp', label: 'Remote MCP server', hint: 'HTTP / SSE' },
]
export interface CustomConnector { id: string; name: string; kind: CustomKind; url: string; header: string; enabled: boolean }
export interface TestResult { ok: boolean; message: string }

const KEY_FORMAT: Record<string, [RegExp, string]> = {
  stripe: [/^pk_(test|live)_[A-Za-z0-9]+/, 'a publishable key starting with pk_test_ / pk_live_'],
  clerk: [/^pk_(test|live)_[A-Za-z0-9=_-]+/, 'a publishable key starting with pk_test_ / pk_live_'],
  resend: [/^re_[A-Za-z0-9_]+/, 'an API key starting with re_'],
  openai: [/^sk-[A-Za-z0-9_-]{10,}/, 'an API key starting with sk-'],
  anthropic: [/^sk-ant-[A-Za-z0-9_-]{10,}/, 'an API key starting with sk-ant-'],
  firebase: [/^AIza[0-9A-Za-z_-]{20,}/, 'a Web API key starting with AIza'],
}

/** Format check + (where CORS allows) a live ping. Never sends secrets anywhere except the provider's own API. */
export async function testExtra(id: string, v: Record<string, string>, f: typeof fetch = fetch): Promise<TestResult> {
  const primary = v.apiKey ?? v.publishableKey ?? v.token ?? ''
  const rule = KEY_FORMAT[id]
  if (rule && !rule[0].test(primary)) return { ok: false, message: `Expected ${rule[1]}.` }
  if (id === 'upstash') {
    try { const r = await f(`${(v.url ?? '').replace(/\/+$/, '')}/ping`, { headers: { Authorization: `Bearer ${v.token ?? ''}` } }); return r.ok ? { ok: true, message: 'Upstash responded.' } : { ok: false, message: `Upstash returned ${r.status}.` } } catch { return { ok: false, message: 'Could not reach that URL (check it, or the browser blocked it).' } }
  }
  if (id === 'openai') {
    try { const r = await f('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${primary}` } }); return r.ok ? { ok: true, message: 'OpenAI accepted the key.' } : { ok: false, message: r.status === 401 ? 'OpenAI rejected the key.' : `OpenAI returned ${r.status}.` } } catch { return { ok: true, message: 'Key format looks valid (live check blocked by browser CORS).' } }
  }
  return { ok: true, message: 'Key format looks valid. It is stored encrypted on this device.' }
}

export function validateCustom(i: { name: string; url: string }): string | null {
  if (!i.name.trim()) return 'Give the connector a name.'
  try { const u = new URL(i.url.trim()); if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'URL must start with http:// or https://' } catch { return 'Enter a valid endpoint URL.' }
  return null
}

export async function testCustom(c: Pick<CustomConnector, 'kind' | 'url' | 'header'>, secret: string, f: typeof fetch = fetch): Promise<TestResult> {
  const headers: Record<string, string> = {}
  if (secret) headers[c.header || 'Authorization'] = secret
  try {
    const r = await f(c.url, c.kind === 'webhook' ? { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ping: 'unqstudio' }) } : { headers })
    return r.status < 500 ? { ok: true, message: `Reachable (HTTP ${r.status}).` } : { ok: false, message: `Server error (HTTP ${r.status}).` }
  } catch { return { ok: false, message: 'Could not reach the endpoint (offline, wrong URL, or blocked by CORS).' } }
}
