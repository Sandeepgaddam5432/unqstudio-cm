import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { handleGithubAuth, readCookie, randomState, STATE_COOKIE, SCOPE, callbackPage } from '../../../functions/api/auth/github'
import { buildMultipartBody, findBackupFile, uploadBackup, downloadBackup } from './googleDriveSync'
import { buildGistPayload, pushGist, pullGist, findSyncGist } from './githubGistSync'
import { collectSettings, sanitizeSettingValue, SYNC_FILE, buildSyncSnapshot, parseSnapshot, serializeSnapshot, applySnapshot } from './snapshot'
import { fetchGithubStatus, sessionFromMessage } from './githubAuth'
import { getGoogleClientId } from './googleAuth'
import { MemoryAdapter } from '@/core/vfs/memoryAdapter'
import { loadSession, useAuth } from '@/store/auth'

const env = { GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'sec' }
const req = (qs: string, cookie?: string, method = 'GET') => new Request(`https://studio.dev/api/auth/github${qs}`, { method, headers: cookie ? { Cookie: cookie } : {} })
const mk = (store: Record<string, string>): Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'> => ({ get length() { return Object.keys(store).length }, key: (i) => Object.keys(store)[i] ?? null, getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v } })

describe('GitHub OAuth Pages Function', () => {
  it('status reports configured / unconfigured', async () => {
    expect(await (await handleGithubAuth(req('?action=status'), env)).json()).toEqual({ configured: true })
    expect(await (await handleGithubAuth(req('?action=status'), {})).json()).toEqual({ configured: false })
    expect(await (await handleGithubAuth(req('?action=status'), { GITHUB_CLIENT_ID: 'x' })).json()).toEqual({ configured: false })
  })
  it('unconfigured login returns an honest 501, not a crash', async () => {
    const r = await handleGithubAuth(req('?action=login'), {})
    expect(r.status).toBe(501)
    expect((await r.json()).error).toMatch(/GITHUB_CLIENT_ID/)
  })
  it('login redirects to GitHub with CSRF state cookie and scopes', async () => {
    const r = await handleGithubAuth(req('?action=login'), env)
    expect(r.status).toBe(302)
    const loc = new URL(r.headers.get('Location')!)
    expect(loc.origin + loc.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(loc.searchParams.get('client_id')).toBe('cid')
    expect(loc.searchParams.get('scope')).toBe(SCOPE)
    expect(loc.searchParams.get('redirect_uri')).toBe('https://studio.dev/api/auth/github')
    const state = loc.searchParams.get('state')!
    const sc = r.headers.get('Set-Cookie')!
    expect(sc).toContain(`${STATE_COOKIE}=${state}`)
    expect(sc).toMatch(/HttpOnly/); expect(sc).toMatch(/Secure/); expect(sc).toMatch(/SameSite=Lax/)
  })
  it('callback rejects missing / mismatched state', async () => {
    expect((await handleGithubAuth(req('?code=abc&state=s1'), env)).status).toBe(400)
    const r = await handleGithubAuth(req('?code=abc&state=s1', `${STATE_COOKIE}=other`), env)
    expect(r.status).toBe(400)
    expect(await r.text()).toContain('Invalid OAuth state')
  })
  it('callback exchanges the code with the server-side secret and returns the session page', async () => {
    const calls: { url: string; body?: string }[] = []
    const f = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body as string })
      if (String(url).includes('access_token')) return new Response(JSON.stringify({ access_token: 'gho_tok' }), { status: 200 })
      return new Response(JSON.stringify({ login: 'octo', name: 'Octo', avatar_url: 'https://a/x.png' }), { status: 200 })
    }) as unknown as typeof fetch
    const r = await handleGithubAuth(req('?code=abc&state=s1', `${STATE_COOKIE}=s1`), env, f)
    expect(r.status).toBe(200)
    expect(JSON.parse(calls[0].body!)).toMatchObject({ client_id: 'cid', client_secret: 'sec', code: 'abc' })
    const html = await r.text()
    expect(html).toContain('gho_tok'); expect(html).toContain('unq-github-auth'); expect(html).toContain('postMessage')
    expect(r.headers.get('Cache-Control')).toBe('no-store')
    expect(r.headers.get('Set-Cookie')).toMatch(/Max-Age=0/)
  })
  it('callback surfaces GitHub errors and escapes script-breaking content', async () => {
    const f = (async () => new Response(JSON.stringify({ error: 'bad_verification_code', error_description: '</script><b>x' }), { status: 200 })) as unknown as typeof fetch
    const r = await handleGithubAuth(req('?code=abc&state=s1', `${STATE_COOKIE}=s1`), env, f)
    expect(r.status).toBe(400)
    const html = await r.text()
    expect(html).not.toContain('</script><b>')
    expect(html).toContain('\\u003c/script')
    expect((await handleGithubAuth(req('?error=access_denied'), env)).status).toBe(400)
    expect((await handleGithubAuth(req('?action=nope'), env)).status).toBe(400)
    expect((await handleGithubAuth(req('?action=login', undefined, 'POST'), env)).status).toBe(405)
  })
  it('helpers', () => {
    expect(readCookie('a=1; unq_gh_state=zz=; b=2', STATE_COOKIE)).toBe('zz=')
    expect(randomState()).toMatch(/^[0-9a-f]{48}$/)
    expect(randomState()).not.toBe(randomState())
    expect(callbackPage({ ok: true, token: 't' }, 'https://x').headers.get('Content-Type')).toContain('text/html')
  })
})

describe('Google Drive AppData sync', () => {
  it('builds a multipart/related body', () => {
    const b = buildMultipartBody({ name: SYNC_FILE, parents: ['appDataFolder'] }, '{"a":1}', 'BND')
    expect(b.startsWith('--BND\r\n')).toBe(true)
    expect(b.endsWith('--BND--')).toBe(true)
    expect(b).toContain('"parents":["appDataFolder"]'); expect(b).toContain('{"a":1}')
  })
  const drive = (existing: boolean) => {
    const calls: { url: string; method: string; body?: string; headers: Record<string, string> }[] = []
    const f = (async (url: string, init?: RequestInit) => {
      const u = String(url); calls.push({ url: u, method: init?.method ?? 'GET', body: init?.body as string, headers: init?.headers as Record<string, string> })
      if (u.includes('/files?spaces=appDataFolder')) return new Response(JSON.stringify({ files: existing ? [{ id: 'F1', name: SYNC_FILE }] : [] }), { status: 200 })
      if (u.includes('alt=media')) return new Response('{"stored":true}', { status: 200 })
      return new Response(JSON.stringify({ id: 'F1' }), { status: 200 })
    }) as unknown as typeof fetch
    return { f, calls }
  }
  it('creates in appDataFolder when absent, PATCHes when present', async () => {
    const a = drive(false)
    expect(await uploadBackup('tok', '{}', a.f)).toBe('F1')
    expect(a.calls[0].url).toContain('spaces=appDataFolder'); expect(a.calls[0].headers.Authorization).toBe('Bearer tok')
    expect(a.calls[1].method).toBe('POST'); expect(a.calls[1].body).toContain('appDataFolder')
    const b = drive(true)
    await uploadBackup('tok', '{}', b.f)
    expect(b.calls[1].method).toBe('PATCH'); expect(b.calls[1].url).toContain('/files/F1?uploadType=multipart'); expect(b.calls[1].body).not.toContain('parents')
    expect((await findBackupFile('t', b.f))?.id).toBe('F1')
  })
  it('downloads, returns null when missing, explains 401', async () => {
    expect(await downloadBackup('t', drive(true).f)).toBe('{"stored":true}')
    expect(await downloadBackup('t', drive(false).f)).toBeNull()
    const f401 = (async () => new Response('', { status: 401 })) as unknown as typeof fetch
    await expect(findBackupFile('t', f401)).rejects.toThrow(/sign in again/)
  })
})

describe('GitHub Gist sync', () => {
  it('payload is a secret single-file gist', () => {
    const p = buildGistPayload('{"x":1}')
    expect(p.public).toBe(false)
    expect(Object.keys(p.files)).toEqual([SYNC_FILE]); expect(p.files[SYNC_FILE].content).toBe('{"x":1}')
    expect(p.description).toMatch(/UnQStudio/)
  })
  const gh = (found: boolean, truncated = false) => {
    const calls: { url: string; method: string; body?: string }[] = []
    const f = (async (url: string, init?: RequestInit) => {
      const u = String(url); calls.push({ url: u, method: init?.method ?? 'GET', body: init?.body as string })
      if (u.includes('/gists?per_page')) return new Response(JSON.stringify(found ? [{ id: 'G1', files: { [SYNC_FILE]: { filename: SYNC_FILE } } }] : [{ id: 'other', files: { 'a.txt': {} } }]), { status: 200 })
      if (u.endsWith('/gists/G1') && (init?.method ?? 'GET') === 'GET') return new Response(JSON.stringify({ files: { [SYNC_FILE]: truncated ? { truncated: true, raw_url: 'https://raw/x' } : { content: '{"g":1}' } } }), { status: 200 })
      if (u === 'https://raw/x') return new Response('{"big":1}', { status: 200 })
      return new Response(JSON.stringify({ id: 'G1' }), { status: 200 })
    }) as unknown as typeof fetch
    return { f, calls }
  }
  it('creates or updates, finds, pulls (incl. truncated raw_url)', async () => {
    const a = gh(false); await pushGist('t', '{}', a.f)
    expect(a.calls.at(-1)).toMatchObject({ method: 'POST', url: 'https://api.github.com/gists' })
    const b = gh(true); await pushGist('t', '{}', b.f)
    expect(b.calls.at(-1)).toMatchObject({ method: 'PATCH', url: 'https://api.github.com/gists/G1' })
    expect(await findSyncGist('t', b.f)).toBe('G1')
    expect(await pullGist('t', gh(true).f)).toBe('{"g":1}')
    expect(await pullGist('t', gh(true, true).f)).toBe('{"big":1}')
    expect(await pullGist('t', gh(false).f)).toBeNull()
  })
})

describe('sync snapshot serializer', () => {
  it('collects only syncable unq.* settings and strips MCP headers', () => {
    const settings = JSON.stringify({ state: { plugins: { mcp: [{ id: 'm', headers: { Authorization: 'Bearer SECRET' } }] } } })
    const out = collectSettings(mk({ 'unq.settings.v1': settings, 'unq.auth.v1': '{}', 'unq.models.v1': '{}', 'other': 'x', 'unq.app.v1': '{"a":1}' }))
    expect(Object.keys(out).sort()).toEqual(['unq.app.v1', 'unq.settings.v1'])
    expect(out['unq.settings.v1']).not.toContain('SECRET')
    expect(sanitizeSettingValue('unq.app.v1', 'raw')).toBe('raw')
    expect(sanitizeSettingValue('unq.settings.v1', 'not json')).toBe('not json')
  })
  it('round-trips projects through serialize → parse → apply, never including the vault', async () => {
    const src = new MemoryAdapter()
    await src.putProject({ id: 'p1', name: 'Demo', createdAt: 1, updatedAt: 2 } as never)
    await src.putFiles([{ projectId: 'p1', path: '/a.txt', content: 'hi', encoding: 'utf8' } as never])
    await src.kvSet('vault', { secret: true })
    const snap = await buildSyncSnapshot(src, mk({ 'unq.app.v1': '{}' }))
    expect(snap.vault).toBeUndefined()
    const text = serializeSnapshot(snap)
    expect(text).not.toContain('secret')
    const dst = new MemoryAdapter(); const ls: Record<string, string> = {}
    const r = await applySnapshot(dst, parseSnapshot(text), mk(ls))
    expect(r).toEqual({ projects: 1, files: 1 })
    expect((await dst.listFiles('p1'))[0].content).toBe('hi')
    expect(ls['unq.app.v1']).toBe('{}')
    expect(() => parseSnapshot('nope')).toThrow(/valid JSON/)
    expect(() => parseSnapshot('{"app":"x"}')).toThrow(/valid UnQStudio backup/)
  })
})

describe('client helpers', () => {
  it('github status never throws and validates JSON', async () => {
    expect(await fetchGithubStatus((async () => new Response(JSON.stringify({ configured: true }), { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch)).toEqual({ configured: true })
    expect(await fetchGithubStatus((async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch)).toEqual({ configured: false })
    expect(await fetchGithubStatus((async () => { throw new Error('offline') }) as unknown as typeof fetch)).toEqual({ configured: false })
  })
  it('session from message + google client id precedence', () => {
    expect(sessionFromMessage({ type: 'unq-github-auth', ok: true, token: 't', user: { login: 'octo', avatar_url: 'a' } })).toMatchObject({ provider: 'github', token: 't', profile: { login: 'octo', name: 'octo', avatar: 'a' } })
    expect(sessionFromMessage({ type: 'unq-github-auth', ok: false })).toBeNull()
    expect(sessionFromMessage({ type: 'other' })).toBeNull()
    expect(getGoogleClientId(' override ')).toBe('override')
    expect(getGoogleClientId('')).toBe('')
  })
})

describe('auth store', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); useAuth.setState({ google: null, github: null, lastSynced: {}, googleClientIdOverride: '', modalOpen: false, guide: null, busy: null, error: null, githubConfigured: false }) })
  it('guest by default; receiving a session stores the token in sessionStorage only', () => {
    expect(useAuth.getState().github).toBeNull()
    useAuth.getState().receiveSession({ provider: 'github', token: 'gho_secret', profile: { name: 'Octo' } })
    expect(useAuth.getState().github?.profile.name).toBe('Octo')
    expect(sessionStorage.getItem('unq.session.github')).toContain('gho_secret')
    expect(JSON.stringify({ ...localStorage })).not.toContain('gho_secret')
    expect(loadSession('github')?.token).toBe('gho_secret')
  })
  it('expired sessions are dropped; sign out clears', () => {
    sessionStorage.setItem('unq.session.google', JSON.stringify({ provider: 'google', token: 't', expiresAt: Date.now() - 1, profile: { name: 'x' } }))
    expect(loadSession('google')).toBeNull()
    useAuth.getState().receiveSession({ provider: 'github', token: 't', profile: { name: 'x' } })
    useAuth.getState().signOut('github')
    expect(useAuth.getState().github).toBeNull(); expect(sessionStorage.getItem('unq.session.github')).toBeNull()
  })
  it('unconfigured providers open the setup guide instead of failing', async () => {
    await useAuth.getState().signInGoogle()
    expect(useAuth.getState().guide).toBe('google')
    useAuth.getState().signInGithub()
    expect(useAuth.getState().guide).toBe('github')
    expect(useAuth.getState().googleConfigured()).toBe(false)
    useAuth.getState().setGoogleClientId('abc.apps.googleusercontent.com')
    expect(useAuth.getState().googleConfigured()).toBe(true)
  })
  it('only non-secret fields persist', () => {
    useAuth.getState().receiveSession({ provider: 'google', token: 'ya29.x', profile: { name: 'G' } })
    useAuth.setState({ lastSynced: { google: 123 } })
    const persisted = localStorage.getItem('unq.auth.v1') ?? ''
    expect(persisted).toContain('123'); expect(persisted).not.toContain('ya29')
  })
  it('sync without a session opens the sign-in modal', async () => {
    await useAuth.getState().sync('github', 'push')
    expect(useAuth.getState().modalOpen).toBe(true)
  })
})
