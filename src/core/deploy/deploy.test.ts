// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PAGES_WORKFLOW, blobPayload, enablePages, importGitHubRepo, parseRepoUrl, pushToGitHub, treePayload } from './github'
import { buildGitLabActions, pushToGitLab } from './gitlab'
import { cloudflareManifest, deployCloudflare, deployNetlify, netlifyDigestPayload, vercelPayload, deployVercel } from './hosts'
import { clientSnippet, generateTypes, jwtRole, parseTables, tsType } from './supabase'
import { snapshotToDeployFiles, staticSiteFiles } from './static'
import { sha1Hex, utf8ToBytes, DeployError } from './common'
import { exportZip } from '@/core/vfs/zip'

type Call = { method: string; url: string; body: any; headers: Record<string, string> }
function router(routes: Array<[RegExp, (c: Call) => unknown | Response]>) {
  const calls: Call[] = []
  const f = (async (url: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
    const c: Call = { method: init.method ?? 'GET', url, body, headers: (init.headers ?? {}) as Record<string, string> }
    calls.push(c)
    for (const [re, h] of routes) if (re.test(`${c.method} ${url}`)) { const r = h(c); return r instanceof Response ? r : new Response(JSON.stringify(r), { status: 200 }) }
    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
  }) as unknown as typeof fetch
  return { f, calls }
}

describe('GitHub', () => {
  it('parses repo references', () => {
    expect(parseRepoUrl('https://github.com/vitejs/vite')).toEqual({ owner: 'vitejs', repo: 'vite', ref: undefined })
    expect(parseRepoUrl('owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo', ref: undefined })
    expect(parseRepoUrl('https://github.com/a/b/tree/dev')).toEqual({ owner: 'a', repo: 'b', ref: 'dev' })
    expect(parseRepoUrl('not a repo')).toBeNull()
  })
  it('builds correct blob and tree payloads', () => {
    expect(blobPayload({ path: 'a', content: 'hi', encoding: 'utf8' })).toEqual({ content: 'hi', encoding: 'utf-8' })
    expect(blobPayload({ path: 'a', content: 'AAA=', encoding: 'base64' })).toEqual({ content: 'AAA=', encoding: 'base64' })
    expect(treePayload('T0', [{ path: 'src/a.ts', sha: 's1' }])).toEqual({ base_tree: 'T0', tree: [{ path: 'src/a.ts', mode: '100644', type: 'blob', sha: 's1' }] })
  })
  it('creates a repo and pushes via blob → tree → commit → ref (tree-commit API)', async () => {
    let created = false
    const { f, calls } = router([
      [/^GET https:\/\/api.github.com\/user$/, () => ({ login: 'octo' })],
      [/^GET .*\/repos\/octo\/demo$/, () => (created ? { default_branch: 'main' } : new Response('{"message":"Not Found"}', { status: 404 }))],
      [/^POST .*\/user\/repos$/, (c) => { created = true; expect(c.body).toMatchObject({ name: 'demo', private: true, auto_init: true }); return { default_branch: 'main' } }],
      [/^GET .*\/git\/ref\/heads\/main$/, () => ({ object: { sha: 'BASE' } })],
      [/^GET .*\/git\/commits\/BASE$/, () => ({ tree: { sha: 'TREE0' } })],
      [/^POST .*\/git\/blobs$/, (c) => ({ sha: 'blob-' + c.body.content.length })],
      [/^POST .*\/git\/trees$/, () => ({ sha: 'TREE1' })],
      [/^POST .*\/git\/commits$/, () => ({ sha: 'COMMIT1' })],
      [/^PATCH .*\/git\/refs\/heads\/main$/, () => ({})],
    ])
    const logs: string[] = []
    const res = await pushToGitHub({ token: 'tok', repo: 'demo', message: 'feat: x', create: { private: true }, onLog: (m) => logs.push(m), files: [{ path: 'src/App.tsx', content: 'abc', encoding: 'utf8' }, { path: 'public/x.png', content: 'AAEC', encoding: 'base64' }] }, f)
    expect(res).toMatchObject({ owner: 'octo', repo: 'demo', commitSha: 'COMMIT1', commitUrl: 'https://github.com/octo/demo/commit/COMMIT1' })
    const order = calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)
    expect(order).toEqual(['GET /user', 'GET /repos/octo/demo', 'POST /user/repos', 'GET /repos/octo/demo/git/ref/heads/main', 'GET /repos/octo/demo/git/commits/BASE', 'POST /repos/octo/demo/git/blobs', 'POST /repos/octo/demo/git/blobs', 'POST /repos/octo/demo/git/trees', 'POST /repos/octo/demo/git/commits', 'PATCH /repos/octo/demo/git/refs/heads/main'])
    const treeCall = calls.find((c) => c.url.endsWith('/git/trees'))!
    expect(treeCall.body.base_tree).toBe('TREE0')
    expect(treeCall.body.tree.map((t: { path: string }) => t.path).sort()).toEqual(['public/x.png', 'src/App.tsx'])
    expect(calls.find((c) => c.url.endsWith('/git/commits') && c.method === 'POST')!.body).toMatchObject({ message: 'feat: x', tree: 'TREE1', parents: ['BASE'] })
    expect(calls[0].headers.Authorization).toBe('Bearer tok')
    expect(logs).toContain('Pushed ✓')
  })
  it('creates a new branch from the default branch and surfaces API errors', async () => {
    const { f, calls } = router([
      [/GET .*\/repos\/o\/r$/, () => ({ default_branch: 'main' })],
      [/GET .*\/git\/ref\/heads\/feature$/, () => new Response('{"message":"Not Found"}', { status: 404 })],
      [/GET .*\/git\/ref\/heads\/main$/, () => ({ object: { sha: 'B' } })],
      [/GET .*\/git\/commits\/B$/, () => ({ tree: { sha: 'T' } })],
      [/POST .*\/git\/blobs$/, () => ({ sha: 's' })], [/POST .*\/git\/trees$/, () => ({ sha: 't' })], [/POST .*\/git\/commits$/, () => ({ sha: 'c' })], [/POST .*\/git\/refs$/, () => ({})],
    ])
    await pushToGitHub({ token: 't', owner: 'o', repo: 'r', branch: 'feature', message: 'm', files: [{ path: 'a', content: 'x', encoding: 'utf8' }] }, f)
    expect(calls[calls.length - 1]).toMatchObject({ method: 'POST', body: { ref: 'refs/heads/feature', sha: 'c' } })
    const bad = router([[/.*/, () => new Response('{"message":"Bad credentials"}', { status: 401 })]])
    await expect(pushToGitHub({ token: 'x', owner: 'o', repo: 'r', message: 'm', files: [] }, bad.f)).rejects.toThrow('Bad credentials')
    const blocked = (async () => { throw new TypeError('Failed') }) as unknown as typeof fetch
    await expect(pushToGitHub({ token: 'x', owner: 'o', repo: 'r', message: 'm', files: [] }, blocked)).rejects.toMatchObject({ blockedByBrowser: true })
  })
  it('imports a public repo (tree + raw downloads), skipping ignored files', async () => {
    const { f, calls } = router([
      [/GET .*\/repos\/o\/r$/, () => ({ name: 'r', default_branch: 'main', description: 'd' })],
      [/GET .*\/git\/trees\/main\?recursive=1$/, () => ({ tree: [{ path: 'src/a.ts', type: 'blob', sha: '1', size: 5 }, { path: 'node_modules/x.js', type: 'blob', sha: '2', size: 5 }, { path: 'img/p.png', type: 'blob', sha: '3', size: 3 }, { path: 'src', type: 'tree', sha: '4' }] })],
      [/GET https:\/\/raw.githubusercontent.com\/o\/r\/main\/src\/a.ts$/, () => new Response('hello')],
      [/GET https:\/\/raw.githubusercontent.com\/o\/r\/main\/img\/p.png$/, () => new Response(new Uint8Array([1, 2, 3]))],
    ])
    const r = await importGitHubRepo({ owner: 'o', repo: 'r' }, f)
    expect(r.name).toBe('r')
    expect(Object.keys(r.files).sort()).toEqual(['/img/p.png', '/src/a.ts'])
    expect(r.files['/src/a.ts']).toEqual({ c: 'hello', e: 'utf8' })
    expect(r.files['/img/p.png'].e).toBe('base64')
    expect(calls.some((c) => c.url.includes('node_modules'))).toBe(false)
  })
  it('ships a Pages workflow and enables Pages (tolerating already-enabled)', async () => {
    expect(PAGES_WORKFLOW).toContain('actions/deploy-pages@v4')
    expect(PAGES_WORKFLOW).toContain('--base=/${{ github.event.repository.name }}/')
    const { f, calls } = router([[/POST .*\/pages$/, () => new Response('{"message":"exists"}', { status: 409 })]])
    expect(await enablePages('t', 'octo', 'demo', f)).toBe('https://octo.github.io/demo/')
    expect(calls[0].body).toEqual({ build_type: 'workflow' })
  })
})

describe('GitLab', () => {
  it('builds create/update actions and commits via the commits API', async () => {
    expect(buildGitLabActions([{ path: 'a', content: 'x', encoding: 'utf8' }, { path: 'b.png', content: 'AA', encoding: 'base64' }], new Set(['a']))).toEqual([
      { action: 'update', file_path: 'a', content: 'x', encoding: 'text' }, { action: 'create', file_path: 'b.png', content: 'AA', encoding: 'base64' }])
    const { f, calls } = router([
      [/GET .*\/projects\/me%2Frepo$/, () => ({ id: 7, default_branch: 'main', web_url: 'https://gitlab.com/me/repo' })],
      [/GET .*\/repository\/tree/, () => [{ path: 'a', type: 'blob' }]],
      [/POST .*\/repository\/commits$/, () => ({ web_url: 'https://gitlab.com/me/repo/-/commit/abc' })],
    ])
    const r = await pushToGitLab({ token: 'glpat', project: 'me/repo', message: 'm', files: [{ path: 'a', content: 'x', encoding: 'utf8' }, { path: 'n', content: 'y', encoding: 'utf8' }] }, f)
    expect(r.commitUrl).toContain('/-/commit/abc')
    expect(calls[0].headers['PRIVATE-TOKEN']).toBe('glpat')
    const commit = calls.find((c) => c.url.endsWith('/repository/commits'))!
    expect(commit.body).toMatchObject({ branch: 'main', commit_message: 'm' })
    expect(commit.body.actions.map((a: { action: string }) => a.action)).toEqual(['update', 'create'])
  })
})

describe('static hosts', () => {
  const files = [{ path: 'index.html', bytes: utf8ToBytes('hello') }, { path: 'assets/a.js', bytes: utf8ToBytes('x') }]
  it('Netlify: sha1 digests, required uploads and ready polling', async () => {
    expect(await sha1Hex(utf8ToBytes('hello'))).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
    const { files: map } = await netlifyDigestPayload(files)
    expect(map['/index.html']).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
    const uploaded: string[] = []
    const { f, calls } = router([
      [/POST .*\/sites$/, () => ({ id: 'site1', ssl_url: 'https://s.netlify.app' })],
      [/POST .*\/sites\/site1\/deploys$/, () => ({ id: 'dep1', required: ['aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d'], state: 'uploading' })],
      [/PUT .*\/deploys\/dep1\/files\/(.+)$/, (c) => { uploaded.push(c.url); return {} }],
      [/GET .*\/deploys\/dep1$/, () => ({ id: 'dep1', state: 'ready', ssl_url: 'https://live.netlify.app' })],
    ])
    const r = await deployNetlify({ token: 'nt', files }, f)
    expect(r.url).toBe('https://live.netlify.app')
    expect(uploaded).toHaveLength(1)
    expect(uploaded[0]).toContain('/deploys/dep1/files/index.html')
    const dep = calls.find((c) => /sites\/site1\/deploys$/.test(c.url))!
    expect(dep.body.files['/index.html']).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
    expect(dep.headers.Authorization).toBe('Bearer nt')
  })
  it('Vercel: v13 payload with base64 files and ready polling', async () => {
    const p = vercelPayload('My Cool App!', files)
    expect(p.name).toBe('my-cool-app')
    expect(p.files[0]).toEqual({ file: 'index.html', data: 'aGVsbG8=', encoding: 'base64' })
    expect(p.projectSettings.framework).toBeNull()
    const { f, calls } = router([[/POST .*\/v13\/deployments\?teamId=team_1$/, () => ({ id: 'd1', url: 'a.vercel.app', readyState: 'READY' })]])
    const r = await deployVercel({ token: 'vt', teamId: 'team_1', name: 'x', files }, f)
    expect(r).toEqual({ url: 'https://a.vercel.app', id: 'd1' })
    expect(calls[0].headers.Authorization).toBe('Bearer vt')
  })
  it('Cloudflare: manifest + multipart upload, and CORS failures are flagged for the fallback guide', async () => {
    const { manifest, byHash } = await cloudflareManifest(files)
    expect(Object.keys(manifest)).toEqual(['/index.html', '/assets/a.js'])
    expect(byHash.size).toBe(2)
    const { f, calls } = router([[/GET .*\/pages\/projects\/site$/, () => ({})], [/POST .*\/pages\/projects\/site\/deployments$/, () => ({ result: { url: 'https://abc.site.pages.dev' } })]])
    expect((await deployCloudflare({ token: 't', accountId: 'acc', project: 'site', files }, f)).url).toBe('https://abc.site.pages.dev')
    expect(calls[1].body).toBeInstanceOf(FormData)
    const blocked = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    const err = await deployCloudflare({ token: 't', accountId: 'a', project: 'p', files }, blocked).catch((e) => e)
    expect(err).toBeInstanceOf(DeployError)
    expect(err.blockedByBrowser).toBe(true)
  })
  it('builds the static bundle (index + SPA fallback + /public assets) and a git-ready project', () => {
    const snap = { '/src/App.tsx': { c: 'x', e: 'utf8' as const }, '/public/logo.png': { c: 'AAEC', e: 'base64' as const }, '/public/robots.txt': { c: 'ok', e: 'utf8' as const } }
    const out = staticSiteFiles('<html></html>', snap)
    expect(out.map((f) => f.path).sort()).toEqual(['_redirects', 'index.html', 'logo.png', 'robots.txt'])
    const git = snapshotToDeployFiles(snap, 'Demo', { '/.github/workflows/deploy.yml': 'y' })
    expect(git.map((f) => f.path)).toEqual(expect.arrayContaining(['package.json', 'vite.config.ts', 'index.html', 'src/App.tsx', 'public/logo.png', '.github/workflows/deploy.yml']))
    expect(git.find((f) => f.path === 'public/logo.png')!.encoding).toBe('base64')
  })
  it('ZIP export integrity: all files present with identical content', async () => {
    const JSZip = (await import('jszip')).default
    const snap = { '/src/App.tsx': { c: 'export default 1', e: 'utf8' as const }, '/public/p.bin.png': { c: 'AAEC', e: 'base64' as const } }
    const zip = await JSZip.loadAsync(await (await exportZip(snap, 'Integrity')).arrayBuffer())
    expect(await zip.file('integrity/src/App.tsx')!.async('string')).toBe('export default 1')
    expect(await zip.file('integrity/public/p.bin.png')!.async('base64')).toBe('AAEC')
    expect(zip.file('integrity/package.json')).toBeTruthy()
  })
})

describe('Supabase', () => {
  const spec = { definitions: { todos: { required: ['id', 'title'], properties: { id: { type: 'integer', format: 'bigint', description: 'Note:\nThis is a Primary Key.<pk/>' }, title: { type: 'string' }, done: { type: 'boolean' }, meta: { type: 'object', format: 'jsonb' } } }, profiles: { required: [], properties: { user_id: { type: 'string', format: 'uuid' } } } } }
  it('parses tables and generates typed client files', () => {
    const tables = parseTables(spec)
    expect(tables.map((t) => t.name)).toEqual(['profiles', 'todos'])
    expect(tables[1].columns.find((c) => c.name === 'id')).toMatchObject({ pk: true, required: true })
    expect(tsType({ type: 'object', format: 'jsonb' })).toBe('Json')
    const ts = generateTypes(tables)
    expect(ts).toContain('export interface Todos {')
    expect(ts).toContain('  id: number')
    expect(ts).toContain('  done?: boolean | null')
    expect(ts).toContain('meta?: Json | null')
    expect(ts).toContain('todos: { Row: Todos;')
    const files = clientSnippet('https://abc.supabase.co/', 'anon-key')
    expect(files['/src/lib/supabase.ts']).toContain("createClient<Database>(url, anonKey)")
    expect(files['/src/lib/supabase.ts']).toContain("'https://abc.supabase.co'")
  })
  it('refuses to embed service_role keys', () => {
    const jwt = (role: string) => 'x.' + btoa(JSON.stringify({ role })).replace(/=+$/, '') + '.y'
    expect(jwtRole(jwt('service_role'))).toBe('service_role')
    expect(() => clientSnippet('https://a.supabase.co', jwt('service_role'))).toThrow(/service_role/)
    expect(() => clientSnippet('https://a.supabase.co', jwt('anon'))).not.toThrow()
  })
})
