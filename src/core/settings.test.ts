// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '@/core/vfs/memoryAdapter'
import { createProject } from '@/core/vfs/projects'
import { VirtualFileSystem } from '@/core/vfs/vfs'
import { createBackup, restoreBackup, validateBackup } from '@/core/vfs/backup'
import { parseRegistry } from './plugins'
import { buildDiagnosticsReport, detectCapabilities } from './diagnostics'
import { extractRpcResult, probeMcpHttp } from '@/core/ai/mcp'
import { verifyConnection } from '@/core/deploy/verify'

describe('backup / restore', () => {
  it('round-trips projects, files, compressed checkpoints, chats and settings', async () => {
    const a = new MemoryAdapter()
    const meta = await createProject(a, { name: 'One', files: { '/src/App.tsx': 'v1', '/public/x.png': { c: 'AAEC', e: 'base64' } as never } })
    const vfs = await VirtualFileSystem.open(a, meta.id)
    await vfs.write('/src/App.tsx', 'v2')
    await vfs.checkpoint('second', 'manual')
    await a.kvSet(`chat:${meta.id}`, { messages: [{ id: 'm1', text: 'hi' }] })
    const backup = await createBackup(a, { settings: { 'unq.settings.v1': '{"a":1}' } })
    const json = JSON.parse(JSON.stringify(backup))
    expect(json.projects[0].checkpoints.length).toBe(2)
    const b = new MemoryAdapter()
    const r = await restoreBackup(b, validateBackup(json), 'replace')
    expect(r).toEqual({ projects: 1, files: 2 })
    const restored = await VirtualFileSystem.open(b, meta.id)
    expect(restored.read('/src/App.tsx')).toBe('v2')
    expect(restored.getRecord('/public/x.png')?.encoding).toBe('base64')
    await restored.restore(restored.listCheckpoints()[0].id)
    expect(restored.read('/src/App.tsx')).toBe('v1')
    expect(await b.kvGet(`chat:${meta.id}`)).toEqual({ messages: [{ id: 'm1', text: 'hi' }] })
    expect(json.settings['unq.settings.v1']).toBe('{"a":1}')
  })
  it('rejects invalid backups and can omit checkpoints/chats', async () => {
    expect(() => validateBackup({ app: 'other' })).toThrow(/not a valid/)
    const a = new MemoryAdapter()
    const m = await createProject(a, { name: 'x', files: { '/a': 'b' } })
    await a.kvSet(`chat:${m.id}`, 1)
    const slim = await createBackup(a, { includeCheckpoints: false, includeChats: false })
    expect(slim.projects[0].checkpoints).toEqual([])
    expect(slim.kv).toEqual([])
  })
})

describe('plugin registry', () => {
  it('validates and normalises declarative entries', () => {
    const reg = parseRegistry({
      themes: [{ id: 'my theme!', name: 'Mine', accent: '#112233', radius: 99 }],
      templates: [{ name: 'T', files: { 'src/App.tsx': 'x' } }],
      providers: [{ name: 'Local', baseUrl: 'http://localhost:8080/v1', models: ['m1'] }],
      mcp: [{ name: 'Docs', url: 'https://mcp.example.com/mcp', transport: 'sse', headers: { Authorization: 'Bearer x' } }],
    })
    expect(reg.themes[0]).toMatchObject({ id: 'my-theme-', accent: '#112233', radius: 48, bg: '#fafafa' })
    expect(Object.keys(reg.templates[0].files)).toEqual(['/src/App.tsx'])
    expect(reg.providers[0].models).toEqual(['m1'])
    expect(reg.mcp[0]).toMatchObject({ transport: 'sse', enabled: true })
    expect(() => parseRegistry({ providers: [{ name: 'x', baseUrl: 'ftp://nope' }] })).toThrow(/http/)
    expect(() => parseRegistry({ templates: [{ name: 'x', files: { '/a.txt': '1' } }] })).toThrow(/App.tsx/)
    expect(parseRegistry(null)).toEqual({ themes: [], templates: [], providers: [], mcp: [] })
  })
})

describe('diagnostics', () => {
  it('detects capabilities and never leaks secrets', () => {
    const caps = detectCapabilities({ indexedDB: {}, WebAssembly: {}, crypto: { subtle: {} } })
    expect(caps.find((c) => c.id === 'idb')?.ok).toBe(true)
    expect(caps.find((c) => c.id === 'fsa')?.ok).toBe(false)
    const rep = buildDiagnosticsReport({ settings: { activeProvider: 'openai', enabled: { openai: true }, apiKey: 'sk-SECRET', plugins: {} }, events: [], capabilities: caps })
    expect(JSON.stringify(rep)).not.toContain('sk-SECRET')
    expect(rep.settings.enabledProviders).toEqual(['openai'])
  })
})

describe('MCP connector', () => {
  const rpc = (body: object, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } })
  it('probes a streamable-HTTP server (initialize → tools/list) with session id', async () => {
    const seen: Array<{ method: string; session: string | null }> = []
    const f = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      seen.push({ method: body.method, session: (init.headers as Record<string, string>)['Mcp-Session-Id'] ?? null })
      if (body.method === 'initialize') return rpc({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'Docs', version: '2.1' } } }, { 'mcp-session-id': 'sess-1' })
      if (body.method === 'tools/list') return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'search', description: 'Search docs' }] } })}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
      return new Response(null, { status: 202 })
    }) as unknown as typeof fetch
    const r = await probeMcpHttp({ url: 'https://x/mcp', headers: {} }, f)
    expect(r).toEqual({ serverName: 'Docs', serverVersion: '2.1', tools: [{ name: 'search', description: 'Search docs' }] })
    expect(seen.map((s) => s.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list'])
    expect(seen[2].session).toBe('sess-1')
    expect(extractRpcResult('data: {"id":5}\n\n', 'text/event-stream', 5).id).toBe(5)
    await expect(probeMcpHttp({ url: 'https://x', headers: {} }, (async () => new Response('', { status: 500 })) as unknown as typeof fetch)).rejects.toThrow(/HTTP 500/)
  })
})

describe('connection verification (mocked fetch)', () => {
  it('calls the right endpoints with the right auth headers', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = []
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> })
      return new Response(JSON.stringify(url.includes('supabase') ? { definitions: { a: {}, b: {} } } : { login: 'octo', username: 'gl', email: 'n@x', user: { username: 'v' }, success: true, result: { status: 'active' } }), { status: 200 })
    }) as unknown as typeof fetch
    expect(await verifyConnection('github', { token: 't1' }, f)).toEqual({ ok: true, message: 'Connected as octo' })
    expect((await verifyConnection('gitlab', { token: 't2' }, f)).message).toContain('gl')
    expect((await verifyConnection('netlify', { token: 't3' }, f)).ok).toBe(true)
    expect((await verifyConnection('vercel', { token: 't4' }, f)).message).toContain('v')
    expect((await verifyConnection('cloudflare', { token: 't5' }, f)).message).toContain('active')
    expect((await verifyConnection('supabase', { url: 'https://abc.supabase.co/', key: 'k' }, f)).message).toContain('2 tables')
    expect(calls[0]).toMatchObject({ url: 'https://api.github.com/user', headers: { Authorization: 'Bearer t1' } })
    expect(calls[1].headers['PRIVATE-TOKEN']).toBe('t2')
    expect(calls[5].url).toBe('https://abc.supabase.co/rest/v1/')
    const bad = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    expect((await verifyConnection('cloudflare', { token: 'x' }, bad)).message).toMatch(/CORS/)
  })
})
