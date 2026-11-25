// Cloudflare Pages Function — GitHub OAuth (authorization-code flow). Standard Web Fetch/Crypto only.
//   GET /api/auth/github?action=status           → { configured }
//   GET /api/auth/github?action=login            → CSRF state cookie + 302 to github.com/login/oauth/authorize
//   GET /api/auth/github?code=…&state=…          → verify state, exchange code with GITHUB_CLIENT_SECRET, hand the session to the SPA
// Env vars: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (Pages → Settings → Environment variables; encrypt the secret).

export interface Env { GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string }
type PagesFunction<E> = (ctx: { request: Request; env: E }) => Response | Promise<Response>

export const STATE_COOKIE = 'unq_gh_state'
export const SCOPE = 'read:user user:email repo gist'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export function randomState(): string {
  const b = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

const cookie = (name: string, value: string, maxAge: number) => `${name}=${value}; Path=/api/auth; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? '').split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return v.join('=') }
  return null
}

/** Safe JSON embedding inside an inline <script>. */
const embed = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

/** Page that returns the session to the opener (popup flow) or stashes it for the SPA (redirect flow). */
export function callbackPage(msg: Record<string, unknown>, origin: string, status = 200, clearState = true): Response {
  const html = `<!doctype html><meta charset="utf-8"><title>UnQStudio · GitHub</title><body style="font:14px system-ui;background:#09090B;color:#fafafa;display:grid;place-items:center;height:100vh;margin:0"><p>${msg.ok ? 'Signed in — returning to UnQStudio…' : 'Sign-in failed. You can close this window.'}</p><script>(function(){var m=${embed({ type: 'unq-github-auth', ...msg })};try{if(window.opener&&!window.opener.closed){window.opener.postMessage(m,${embed(origin)});window.close();return}}catch(e){}try{sessionStorage.setItem('unq.session.pending',JSON.stringify(m))}catch(e){}location.replace('/')})()</script>`
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
  if (clearState) headers.append('Set-Cookie', cookie(STATE_COOKIE, '', 0))
  return new Response(html, { status, headers })
}

export async function handleGithubAuth(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url)
  const action = url.searchParams.get('action')
  const configured = !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  if (action === 'status') return json({ configured })
  if (!configured) return json({ configured: false, error: 'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in Cloudflare Pages → Settings → Environment variables.' }, 501)

  const redirectUri = `${url.origin}${url.pathname}`
  if (action === 'login') {
    const state = randomState()
    const dest = new URL('https://github.com/login/oauth/authorize')
    dest.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID!, redirect_uri: redirectUri, scope: SCOPE, state, allow_signup: 'true' }).toString()
    return new Response(null, { status: 302, headers: { Location: dest.toString(), 'Set-Cookie': cookie(STATE_COOKIE, state, 600), 'Cache-Control': 'no-store' } })
  }

  const err = url.searchParams.get('error')
  if (err) return callbackPage({ ok: false, error: url.searchParams.get('error_description') || err }, url.origin, 400)
  const code = url.searchParams.get('code')
  if (code) {
    const state = url.searchParams.get('state')
    const expected = readCookie(request.headers.get('Cookie'), STATE_COOKIE)
    if (!state || !expected || state !== expected) return callbackPage({ ok: false, error: 'Invalid OAuth state (possible CSRF or expired login). Please try again.' }, url.origin, 400)
    try {
      const tr = await fetchImpl('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri }),
      })
      const t = await tr.json() as { access_token?: string; error?: string; error_description?: string }
      if (!t.access_token) return callbackPage({ ok: false, error: t.error_description || t.error || 'GitHub did not return a token.' }, url.origin, 400)
      let user: Record<string, unknown> = {}
      try {
        const ur = await fetchImpl('https://api.github.com/user', { headers: { Authorization: `Bearer ${t.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'UnQStudio' } })
        if (ur.ok) { const u = await ur.json() as Record<string, unknown>; user = { login: u.login, name: u.name, avatar_url: u.avatar_url, email: u.email } }
      } catch { /* profile is optional */ }
      return callbackPage({ ok: true, token: t.access_token, user }, url.origin)
    } catch (e) {
      return callbackPage({ ok: false, error: e instanceof Error ? e.message : 'Token exchange failed.' }, url.origin, 502)
    }
  }
  return json({ error: 'Unknown action. Use ?action=login | status.' }, 400)
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => handleGithubAuth(request, env)
