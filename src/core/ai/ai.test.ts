// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ArtifactStreamParser, cleanFileContent, parseArtifacts, type ParserEvent } from './parser'
import { applyPatch, parsePatchBlocks } from './patch'
import { estimateCost, estimateTokens } from './tokens'
import { Vault, decryptJSON, encryptJSON } from './vault'
import { MemoryAdapter } from '@/core/vfs/memoryAdapter'
import { createProject } from '@/core/vfs/projects'
import { VirtualFileSystem } from '@/core/vfs/vfs'
import { applyOp } from './apply'
import { buildAnthropicRequest, buildOpenAIRequest, parseAnthropicEvent, parseOpenAIData, sseEvents, streamChat } from './stream'
import { getProvider } from './providers'
import { buildProjectContext, extractMentions, systemInstructions } from './prompts'
import { runTurn, buildMessages, summarizeOps } from './orchestrator'

function stream(...chunks: string[]) {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({ start(c) { chunks.forEach((x) => c.enqueue(enc.encode(x))); c.close() } })
}
const sse = (objs: unknown[]) => objs.map((o) => `data: ${typeof o === 'string' ? o : JSON.stringify(o)}\n\n`)
const fakeFetch = (chunks: string[], status = 200) => (async () => new Response(stream(...chunks), { status })) as unknown as typeof fetch
const collect = (events: ParserEvent[]) => ({
  text: events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join(''),
  think: events.filter((e) => e.type === 'think-delta').map((e) => (e as { text: string }).text).join(''),
  ends: events.filter((e) => e.type === 'file-end') as Extract<ParserEvent, { type: 'file-end' }>[],
  deletes: events.filter((e) => e.type === 'delete') as Extract<ParserEvent, { type: 'delete' }>[],
})

describe('artifact stream parser', () => {
  const doc = 'Sure!\n<think>plan it</think>\nI will edit.\n<create_file path="/src/A.tsx">\nexport const A = () => <div>1 < 2</div>\n</create_file>\n<patch_file path="/src/B.ts">\n<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE\n</patch_file>\n<delete_file path="/old.ts" />\nDone.'
  it('parses a complete document', () => {
    const r = collect(parseArtifacts(doc))
    expect(r.text).toContain('Sure!')
    expect(r.text).toContain('Done.')
    expect(r.think).toBe('plan it')
    expect(r.ends.map((e) => [e.op, e.path, e.complete])).toEqual([['create', '/src/A.tsx', true], ['patch', '/src/B.ts', true]])
    expect(r.ends[0].content).toBe('export const A = () => <div>1 < 2</div>')
    expect(r.deletes[0].path).toBe('/old.ts')
  })
  it('is invariant to chunk boundaries (split at every position)', () => {
    const whole = collect(parseArtifacts(doc))
    for (let i = 1; i < doc.length; i++) {
      const p = new ArtifactStreamParser()
      const ev = [...p.push(doc.slice(0, i)), ...p.push(doc.slice(i)), ...p.flush()]
      const r = collect(ev)
      expect(r.text).toBe(whole.text)
      expect(r.think).toBe(whole.think)
      expect(r.ends.map((e) => e.content)).toEqual(whole.ends.map((e) => e.content))
      expect(r.deletes.length).toBe(1)
    }
  })
  it('works char-by-char and holds back partial closers', () => {
    const p = new ArtifactStreamParser()
    const ev: ParserEvent[] = []
    for (const ch of doc) ev.push(...p.push(ch))
    ev.push(...p.flush())
    expect(collect(ev).ends.length).toBe(2)
    const starts = ev.filter((e) => e.type === 'file-start').length
    expect(starts).toBe(2)
  })
  it('treats unknown tags / lone < as text', () => {
    const r = collect(parseArtifacts('a <b> c < d <div>x</div>'))
    expect(r.text).toBe('a <b> c < d <div>x</div>')
  })
  it('marks truncated files as incomplete and strips code fences', () => {
    const r = collect(parseArtifacts('<create_file path="/x.ts">\nconst a = 1'))
    expect(r.ends[0]).toMatchObject({ complete: false, content: 'const a = 1' })
    expect(cleanFileContent('\n```tsx\nconst a = 1\n```\n')).toBe('const a = 1')
    expect(collect(parseArtifacts('<update_file path="/x.ts">\n```ts\nlet z\n```\n</update_file>')).ends[0].content).toBe('let z')
  })
  it('handles an unterminated think block and delete with explicit close', () => {
    const ev = parseArtifacts('<think>hmm')
    expect(ev.map((e) => e.type)).toEqual(['think-start', 'think-delta', 'think-end'])
    expect(collect(parseArtifacts('<delete_file path="/a.ts"></delete_file>ok')).text).toBe('ok')
  })
})

describe('patch engine', () => {
  const file = 'function A() {\n  const x = 1\n  return x\n}\n'
  it('parses blocks and applies exact search/replace', () => {
    const blocks = parsePatchBlocks('<<<<<<< SEARCH\n  const x = 1\n=======\n  const x = 2\n>>>>>>> REPLACE\n<<<<<<< SEARCH\n  return x\n=======\n  return x * 2\n>>>>>>> REPLACE')
    expect(blocks).toHaveLength(2)
    const r = applyPatch(file, blocks)
    expect(r.ok).toBe(true)
    expect(r.content).toBe('function A() {\n  const x = 2\n  return x * 2\n}\n')
  })
  it('tolerates indentation differences', () => {
    const r = applyPatch(file, [{ search: 'const x = 1\nreturn x', replace: 'const y = 5\nreturn y' }])
    expect(r.ok).toBe(true)
    expect(r.content).toBe('function A() {\n  const y = 5\n  return y\n}\n')
  })
  it('is all-or-nothing and reports failures', () => {
    const r = applyPatch(file, [{ search: 'const x = 1', replace: 'const x = 9' }, { search: 'does not exist', replace: 'x' }])
    expect(r.ok).toBe(false)
    expect(r.content).toBe(file)
    expect(r.failures[0].index).toBe(1)
    expect(applyPatch(file, []).ok).toBe(false)
  })
  it('supports deletions (empty replace) and appends (empty search)', () => {
    expect(applyPatch('a\nb\nc', [{ search: 'b\n', replace: '' }]).content).toBe('a\nc')
    expect(applyPatch('a\n', [{ search: '', replace: 'z' }]).content).toBe('a\nz')
  })
})

describe('tokens', () => {
  it('estimates tokens and cost', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('x'.repeat(370))).toBe(100)
    expect(estimateCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, { priceIn: 3, priceOut: 15 })).toBe(18)
    expect(estimateCost({ inputTokens: 1, outputTokens: 1 }, {})).toBeNull()
  })
})

describe('vault crypto', () => {
  it('AES-GCM round trip + wrong passphrase', async () => {
    const blob = await encryptJSON({ k: 'sk-secret' }, 'correct horse', 1000)
    expect(blob.data).not.toContain('sk-secret')
    expect(await decryptJSON(blob, 'correct horse')).toEqual({ k: 'sk-secret' })
    await expect(decryptJSON(blob, 'nope nope')).rejects.toThrow('Wrong passphrase')
  })
  it('Vault: plain → encrypted → locked → unlock → decrypted', async () => {
    const adapter = new MemoryAdapter()
    const v = new Vault(adapter, { iterations: 1000 })
    await v.load()
    await v.set('provider:openai', 'sk-123')
    expect(JSON.stringify(await adapter.kvGet('vault'))).toContain('sk-123')
    await v.enableEncryption('hunter22')
    const stored = JSON.stringify(await adapter.kvGet('vault'))
    expect(stored).not.toContain('sk-123')
    await v.set('provider:groq', 'gsk-9')
    const v2 = new Vault(adapter, { iterations: 1000 })
    await v2.load()
    expect(v2.locked).toBe(true)
    expect(v2.get('provider:openai')).toBeUndefined()
    await expect(v2.unlock('bad-pass')).rejects.toThrow('Wrong passphrase')
    await v2.unlock('hunter22')
    expect(v2.get('provider:openai')).toBe('sk-123')
    expect(v2.get('provider:groq')).toBe('gsk-9')
    await v2.disableEncryption()
    expect(JSON.stringify(await adapter.kvGet('vault'))).toContain('gsk-9')
  })
})

describe('streaming adapters', () => {
  it('parses SSE across chunk boundaries', async () => {
    const evs = []
    for await (const e of sseEvents(stream('data: {"a"', ':1}\n\nevent: x\ndata: two\r\n\r\ndata: [DONE]\n\n'))) evs.push(e)
    expect(evs).toEqual([{ event: undefined, data: '{"a":1}' }, { event: 'x', data: 'two' }, { event: undefined, data: '[DONE]' }])
  })
  it('builds OpenAI-compatible requests with vision content', () => {
    const { url, init } = buildOpenAIRequest({ provider: getProvider('groq')!, model: 'm', apiKey: 'k', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'image', dataUrl: 'data:image/png;base64,AAA' }] }] })
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    const body = JSON.parse(init.body as string)
    expect(body.stream).toBe(true)
    expect(body.messages[0].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    expect(JSON.parse(buildOpenAIRequest({ provider: getProvider('gemini')!, model: 'm', messages: [] }).init.body as string).stream_options).toBeUndefined()
  })
  it('builds Anthropic requests with the browser-access header and base64 images', () => {
    const { url, init } = buildAnthropicRequest({ provider: getProvider('anthropic')!, model: 'claude', apiKey: 'ak', messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: [{ type: 'text', text: 'x' }, { type: 'image', dataUrl: 'data:image/jpeg;base64,QQ==' }] }] })
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const h = init.headers as Record<string, string>
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(h['x-api-key']).toBe('ak')
    const body = JSON.parse(init.body as string)
    expect(body.system).toBe('SYS')
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].content[1].source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: 'QQ==' })
  })
  it('parses OpenAI deltas incl. reasoning + usage and Anthropic events', () => {
    expect(parseOpenAIData(JSON.stringify({ choices: [{ delta: { reasoning_content: 'r', content: 'c' } }] }))).toEqual([{ type: 'reasoning', text: 'r' }, { type: 'text', text: 'c' }])
    expect(parseOpenAIData(JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 7 } }))).toEqual([{ type: 'usage', usage: { inputTokens: 5, outputTokens: 7 } }])
    expect(parseOpenAIData('[DONE]')).toBe('done')
    expect(() => parseOpenAIData('{"error":{"message":"bad"}}')).toThrow('bad')
    const st = { inputTokens: 0 }
    parseAnthropicEvent({ data: JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 11 } } }) }, st)
    expect(parseAnthropicEvent({ data: JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'yo' } }) }, st)).toEqual([{ type: 'text', text: 'yo' }])
    expect(parseAnthropicEvent({ data: JSON.stringify({ type: 'message_delta', usage: { output_tokens: 3 } }) }, st)).toEqual([{ type: 'usage', usage: { inputTokens: 11, outputTokens: 3 } }])
  })
  it('surfaces HTTP errors with hints and network errors', async () => {
    const f401 = (async () => new Response('{"error":{"message":"Invalid key"}}', { status: 401 })) as unknown as typeof fetch
    await expect((async () => { for await (const _ of streamChat({ provider: getProvider('openai')!, model: 'm', messages: [], fetchImpl: f401 })) void _ })()).rejects.toMatchObject({ message: 'Invalid key', status: 401 })
    const boom = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    await expect((async () => { for await (const _ of streamChat({ provider: getProvider('ollama')!, model: 'm', messages: [], fetchImpl: boom })) void _ })()).rejects.toMatchObject({ hint: expect.stringContaining('CORS') })
  })
})

async function projectVfs() {
  const adapter = new MemoryAdapter()
  const meta = await createProject(adapter, { name: 'P', files: { '/src/App.tsx': 'export default function App() {\n  return <h1>Hi</h1>\n}\n', '/src/locked.ts': 'export const L = 1', '/package.json': '{}' } })
  const vfs = await VirtualFileSystem.open(adapter, meta.id)
  await vfs.lock('/src/locked.ts')
  return vfs
}

describe('applyOp & file-lock enforcement', () => {
  it('creates, patches, deletes and reports locked files', async () => {
    const vfs = await projectVfs()
    expect((await applyOp(vfs, 'create', '/src/New.tsx', 'a\nb')).status).toBe('applied')
    const patched = await applyOp(vfs, 'patch', '/src/App.tsx', '<<<<<<< SEARCH\n<h1>Hi</h1>\n=======\n<h1>Hello</h1>\n>>>>>>> REPLACE')
    expect(patched).toMatchObject({ status: 'applied', added: 1, removed: 1 })
    expect(vfs.read('/src/App.tsx')).toContain('Hello')
    const locked = await applyOp(vfs, 'update', '/src/locked.ts', 'hacked')
    expect(locked.status).toBe('skipped-locked')
    expect(vfs.read('/src/locked.ts')).toBe('export const L = 1')
    expect((await applyOp(vfs, 'patch', '/src/locked.ts', '<<<<<<< SEARCH\n1\n=======\n2\n>>>>>>> REPLACE')).status).toBe('skipped-locked')
    expect((await applyOp(vfs, 'delete', '/src/locked.ts')).status).toBe('skipped-locked')
    expect((await applyOp(vfs, 'patch', '/src/missing.ts', 'x')).status).toBe('failed')
    expect((await applyOp(vfs, 'patch', '/src/App.tsx', '<<<<<<< SEARCH\nnope\n=======\nx\n>>>>>>> REPLACE')).status).toBe('failed')
    expect((await applyOp(vfs, 'create', '/node_modules/x.js', 'x')).status).toBe('failed')
    expect((await applyOp(vfs, 'delete', '/src/New.tsx')).status).toBe('applied')
  })
})

describe('context & mentions', () => {
  it('lists files, flags locks and honours @mentions', async () => {
    const vfs = await projectVfs()
    const ctx = buildProjectContext(vfs, { mentioned: ['/src/locked.ts'] })
    expect(ctx.text).toContain('/src/locked.ts [LOCKED]')
    expect(ctx.text).toContain('LOCKED paths')
    expect(extractMentions('look at @src/App.tsx and @locked.ts and @/src', vfs.paths()).sort()).toEqual(['/src/App.tsx', '/src/locked.ts'])
    const tight = buildProjectContext(vfs, { budgetChars: 10 })
    expect(tight.files.some((f) => !f.included)).toBe(true)
    expect(systemInstructions('ask')).not.toContain('<create_file')
    expect(systemInstructions('build', ['Use 2 spaces'])).toContain('Use 2 spaces')
  })
})

describe('orchestrator end-to-end (mocked provider)', () => {
  const reply = 'On it.\n<think>reason</think><create_file path="/src/Hero.tsx">\nexport const Hero = () => null\n</create_file>\n<update_file path="/src/locked.ts">\nx\n</update_file>\n<patch_file path="/src/App.tsx">\n<<<<<<< SEARCH\nHi\n=======\nYo\n>>>>>>> REPLACE\n</patch_file>\nAll done.'
  const chunks = (s: string) => sse([...s.match(/[\s\S]{1,7}/g)!.map((t) => ({ choices: [{ delta: { content: t } }] })), { choices: [], usage: { prompt_tokens: 100, completion_tokens: 50 } }, '[DONE]'])

  it('streams, applies ops, respects locks, creates before/after checkpoints', async () => {
    const vfs = await projectVfs()
    const events: string[] = []
    const res = await runTurn({ vfs, provider: getProvider('openai')!, model: 'gpt', apiKey: 'k', mode: 'build', history: [], userText: 'add hero', fetchImpl: fakeFetch(chunks(reply)), onEvent: (e) => events.push(e.type) })
    expect(res.ops.map((o) => [o.path, o.status])).toEqual([['/src/Hero.tsx', 'applied'], ['/src/locked.ts', 'skipped-locked'], ['/src/App.tsx', 'applied']])
    expect(vfs.read('/src/Hero.tsx')).toBe('export const Hero = () => null')
    expect(vfs.read('/src/locked.ts')).toBe('export const L = 1')
    expect(vfs.read('/src/App.tsx')).toContain('Yo')
    expect(res.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
    expect(events).toContain('think-start')
    expect(events).toContain('op-progress')
    expect(res.checkpointBefore).toBeTruthy()
    expect(res.checkpointAfter).toBeTruthy()
    expect(vfs.listCheckpoints().some((c) => c.id === res.checkpointBefore)).toBe(true)
    expect(vfs.listCheckpoints().find((c) => c.id === res.checkpointAfter)?.kind).toBe('ai')
    expect(summarizeOps(res.ops)).toContain('SKIPPED because the user locked them: /src/locked.ts')
    // undo this turn
    await vfs.restore(res.checkpointBefore!)
    expect(vfs.has('/src/Hero.tsx')).toBe(false)
  })
  it('approval tray holds ops; ask mode never writes; reasoning deltas become think events', async () => {
    const vfs = await projectVfs()
    const res = await runTurn({ vfs, provider: getProvider('openai')!, model: 'gpt', mode: 'build', history: [], userText: 'x', requireApproval: true, fetchImpl: fakeFetch(chunks(reply)) })
    expect(res.ops.filter((o) => o.status === 'pending').length).toBe(3)
    expect(vfs.has('/src/Hero.tsx')).toBe(false)
    const ask = await runTurn({ vfs, provider: getProvider('openai')!, model: 'gpt', mode: 'ask', history: [], userText: 'x', fetchImpl: fakeFetch(chunks(reply)) })
    expect(ask.ops).toHaveLength(0)
    expect(vfs.has('/src/Hero.tsx')).toBe(false)
    const events: string[] = []
    await runTurn({ vfs, provider: getProvider('deepseek')!, model: 'r', mode: 'ask', history: [], userText: 'x', onEvent: (e) => events.push(e.type), fetchImpl: fakeFetch(sse([{ choices: [{ delta: { reasoning_content: 'hmm' } }] }, { choices: [{ delta: { content: 'ok' } }] }, '[DONE]'])) })
    expect(events.slice(0, 3)).toEqual(['think-start', 'think-delta', 'think-end'])
  })
  it('flags truncated streams and estimates usage when the provider omits it', async () => {
    const vfs = await projectVfs()
    const res = await runTurn({ vfs, provider: getProvider('openai')!, model: 'gpt', mode: 'build', history: [], userText: 'x', fetchImpl: fakeFetch(sse([{ choices: [{ delta: { content: '<create_file path="/src/Cut.tsx">\nhalf' } }] }, '[DONE]'])) })
    expect(res.ops[0]).toMatchObject({ status: 'failed' })
    expect(vfs.has('/src/Cut.tsx')).toBe(false)
    expect(res.usage.estimated).toBe(true)
    expect(buildMessages({ vfs, mode: 'build', history: [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b', summary: '[S]' }], userText: 'c' }).messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
  })
})
