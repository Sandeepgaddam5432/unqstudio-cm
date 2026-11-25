import type { Creds, ServiceId } from '@/core/deploy/verify'
import { getSecret } from './vault'

export interface ServiceField { key: string; label: string; secret?: boolean; placeholder?: string; optional?: boolean }
export interface ServiceDef { id: ServiceId; name: string; blurb: string; help: string; fields: ServiceField[] }

export const SERVICES: ServiceDef[] = [
  { id: 'github', name: 'GitHub', blurb: 'Import repos, push projects, deploy to GitHub Pages.', help: 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=UnQStudio', fields: [{ key: 'token', label: 'Personal access token', secret: true, placeholder: 'github_pat_… or ghp_…' }] },
  { id: 'gitlab', name: 'GitLab', blurb: 'Push project files to a GitLab repository.', help: 'https://gitlab.com/-/user_settings/personal_access_tokens', fields: [{ key: 'token', label: 'Personal access token (api scope)', secret: true }, { key: 'baseUrl', label: 'Instance URL', placeholder: 'https://gitlab.com', optional: true }] },
  { id: 'cloudflare', name: 'Cloudflare Pages', blurb: 'Direct-upload deployments (browser CORS may restrict this API).', help: 'https://dash.cloudflare.com/profile/api-tokens', fields: [{ key: 'token', label: 'API token (Pages: Edit)', secret: true }, { key: 'accountId', label: 'Account ID' }] },
  { id: 'netlify', name: 'Netlify', blurb: 'One-click static deploys via the Deploy API.', help: 'https://app.netlify.com/user/applications#personal-access-tokens', fields: [{ key: 'token', label: 'Personal access token', secret: true }] },
  { id: 'vercel', name: 'Vercel', blurb: 'Create deployments with the Deployments API.', help: 'https://vercel.com/account/tokens', fields: [{ key: 'token', label: 'Access token', secret: true }, { key: 'teamId', label: 'Team ID', optional: true, placeholder: 'team_…' }] },
  { id: 'supabase', name: 'Supabase', blurb: 'Browse tables and inject a typed client into your app.', help: 'https://supabase.com/dashboard/project/_/settings/api', fields: [{ key: 'url', label: 'Project URL', placeholder: 'https://xyzcompany.supabase.co' }, { key: 'key', label: 'Anon / service key', secret: true }] },
]

export const connSecretName = (service: ServiceId, field: string) => `conn:${service}:${field}`

export function getConn(service: ServiceId): Creds {
  const def = SERVICES.find((s) => s.id === service)!
  const out: Creds = {}
  for (const f of def.fields) { const v = getSecret(connSecretName(service, f.key)); if (v) out[f.key] = v }
  return out
}
export function isConnected(service: ServiceId): boolean {
  const def = SERVICES.find((s) => s.id === service)!
  const c = getConn(service)
  return def.fields.filter((f) => !f.optional).every((f) => !!c[f.key])
}
