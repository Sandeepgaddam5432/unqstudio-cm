import type { AuthSession } from './types'

export interface GithubAuthMessage { type: 'unq-github-auth'; ok: boolean; token?: string; user?: { login?: string; name?: string; avatar_url?: string; email?: string }; error?: string }
export const PENDING_KEY = 'unq.session.pending'

const endpoint = (qs: string) => new URL(`api/auth/github?${qs}`, typeof document !== 'undefined' ? document.baseURI : 'http://localhost/').toString()

/** Asks the Cloudflare Function whether GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are set. Never throws. */
export async function fetchGithubStatus(f: typeof fetch = fetch): Promise<{ configured: boolean }> {
  try {
    const res = await f(endpoint('action=status'), { headers: { Accept: 'application/json' } })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return { configured: false }
    const j = await res.json() as { configured?: boolean }
    return { configured: j.configured === true }
  } catch { return { configured: false } }
}

export const githubLoginUrl = () => endpoint('action=login')

/** Opens the OAuth popup; falls back to a full-page redirect if popups are blocked. */
export function openGithubLogin(): void {
  const w = window.open(githubLoginUrl(), 'unq-github-auth', 'width=520,height=720,noopener=no')
  if (!w) location.assign(githubLoginUrl())
}

export function sessionFromMessage(m: unknown): AuthSession | null {
  const d = m as GithubAuthMessage | null
  if (!d || d.type !== 'unq-github-auth' || !d.ok || !d.token) return null
  return { provider: 'github', token: d.token, profile: { name: d.user?.name || d.user?.login || 'GitHub user', login: d.user?.login, email: d.user?.email, avatar: d.user?.avatar_url } }
}
