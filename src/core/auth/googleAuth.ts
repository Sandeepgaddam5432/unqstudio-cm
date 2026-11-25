import type { AuthSession } from './types'

export const GOOGLE_SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.appdata'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void }
interface GisApi { accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }) => TokenClient; revoke: (t: string, done?: () => void) => void } } }
declare global { interface Window { google?: GisApi } }

/** Client id: Settings override (self-hosters) wins, then the build-time VITE_GOOGLE_CLIENT_ID. */
export function getGoogleClientId(override?: string): string {
  return (override?.trim() || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '').trim()
}

let gis: Promise<void> | null = null
export function loadGis(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google sign-in needs a browser.'))
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return (gis ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GIS_SRC; s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => { gis = null; reject(new Error('Could not load Google Identity Services (offline or blocked).')) }
    document.head.appendChild(s)
  }))
}

export async function fetchGoogleProfile(token: string, f: typeof fetch = fetch): Promise<AuthSession['profile']> {
  const res = await f('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Google profile request failed (HTTP ${res.status}).`)
  const j = await res.json() as { name?: string; email?: string; picture?: string }
  return { name: j.name || j.email || 'Google user', email: j.email, avatar: j.picture }
}

/** 100% client-side: Google Identity Services OAuth2 token client — no backend secret involved. */
export async function signInWithGoogle(clientId: string): Promise<AuthSession> {
  if (!clientId) throw new Error('Google sign-in is not configured.')
  await loadGis()
  const token = await new Promise<TokenResponse>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: GOOGLE_SCOPES,
      callback: (r) => (r.error || !r.access_token ? reject(new Error(r.error_description || r.error || 'Google sign-in was cancelled.')) : resolve(r)),
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Google sign-in window was closed.' : e.message || e.type)),
    })
    client.requestAccessToken({ prompt: '' })
  })
  const profile = await fetchGoogleProfile(token.access_token!)
  return { provider: 'google', token: token.access_token!, expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000, profile }
}

export function revokeGoogle(token: string) { try { window.google?.accounts.oauth2.revoke(token) } catch { /* best effort */ } }
