export type ServiceId = 'github' | 'gitlab' | 'cloudflare' | 'netlify' | 'vercel' | 'supabase'
export type Creds = Record<string, string>
export interface VerifyResult { ok: boolean; message: string }

const netErr = (service: string, e: unknown) =>
  `Network error reaching ${service}${e instanceof Error ? ` (${e.message})` : ''}. ${service === 'Cloudflare' ? 'Cloudflare’s API does not allow browser (CORS) requests — verification and direct upload may be blocked; use the Git-connect fallback in Publish.' : 'Check your connection and token.'}`

async function json(res: Response) { try { return await res.json() } catch { return {} } }

/** Verify a personal token against the real service API (all calls are made directly from the browser). */
export async function verifyConnection(service: ServiceId, c: Creds, f: typeof fetch = fetch): Promise<VerifyResult> {
  try {
    switch (service) {
      case 'github': {
        const res = await f('https://api.github.com/user', { headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json' } })
        const j = await json(res)
        return res.ok ? { ok: true, message: `Connected as ${j.login}` } : { ok: false, message: j.message ?? `HTTP ${res.status}` }
      }
      case 'gitlab': {
        const base = (c.baseUrl || 'https://gitlab.com').replace(/\/+$/, '')
        const res = await f(`${base}/api/v4/user`, { headers: { 'PRIVATE-TOKEN': c.token } })
        const j = await json(res)
        return res.ok ? { ok: true, message: `Connected as ${j.username}` } : { ok: false, message: j.message ?? `HTTP ${res.status}` }
      }
      case 'netlify': {
        const res = await f('https://api.netlify.com/api/v1/user', { headers: { Authorization: `Bearer ${c.token}` } })
        const j = await json(res)
        return res.ok ? { ok: true, message: `Connected as ${j.email ?? j.full_name}` } : { ok: false, message: j.message ?? `HTTP ${res.status}` }
      }
      case 'vercel': {
        const res = await f('https://api.vercel.com/v2/user', { headers: { Authorization: `Bearer ${c.token}` } })
        const j = await json(res)
        return res.ok ? { ok: true, message: `Connected as ${j.user?.username ?? j.user?.email}` } : { ok: false, message: j.error?.message ?? `HTTP ${res.status}` }
      }
      case 'cloudflare': {
        const res = await f('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: { Authorization: `Bearer ${c.token}` } })
        const j = await json(res)
        return j.success ? { ok: true, message: `Token is ${j.result?.status ?? 'valid'}` } : { ok: false, message: j.errors?.[0]?.message ?? `HTTP ${res.status}` }
      }
      case 'supabase': {
        const url = c.url.replace(/\/+$/, '')
        const res = await f(`${url}/rest/v1/`, { headers: { apikey: c.key, Authorization: `Bearer ${c.key}` } })
        if (!res.ok) return { ok: false, message: `HTTP ${res.status} – check the project URL and key` }
        const j = await json(res)
        const n = Object.keys(j.definitions ?? j.components?.schemas ?? {}).length
        return { ok: true, message: `Connected · ${n} table${n === 1 ? '' : 's'} exposed over REST` }
      }
    }
  } catch (e) {
    return { ok: false, message: netErr(service[0].toUpperCase() + service.slice(1), e) }
  }
}
