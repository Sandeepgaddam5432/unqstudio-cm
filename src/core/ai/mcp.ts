import type { McpConnector } from '@/store/settings'

export interface McpTool { name: string; description?: string }
export interface McpProbe { serverName: string; serverVersion: string; tools: McpTool[] }

const PROTOCOL = '2025-03-26'

/** Pull the JSON-RPC response with `id` out of either a JSON body or an SSE-formatted body. */
export function extractRpcResult(body: string, contentType: string, id: number): any {
  if (contentType.includes('text/event-stream')) {
    for (const block of body.split(/\n\n+/)) {
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('')
      if (!data) continue
      try { const j = JSON.parse(data); if (j.id === id) return j } catch { /* keep scanning */ }
    }
    throw new Error('No JSON-RPC response found in the event stream')
  }
  return JSON.parse(body)
}

async function postRpc(url: string, headers: Record<string, string>, payload: object, id: number | null, f: typeof fetch) {
  const res = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error(`HTTP ${res.status} from MCP server`)
  if (id === null) return { res, json: null as any }
  const json = extractRpcResult(await res.text(), res.headers.get('content-type') ?? '', id)
  if (json.error) throw new Error(json.error.message ?? 'MCP error')
  return { res, json }
}

/** Streamable-HTTP MCP probe: initialize → notifications/initialized → tools/list. The server must allow CORS. */
export async function probeMcpHttp(c: Pick<McpConnector, 'url' | 'headers'>, f: typeof fetch = fetch): Promise<McpProbe> {
  const init = await postRpc(c.url, c.headers, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'UnQStudio', version: '1.0.0' } } }, 1, f)
  const session = init.res.headers.get('mcp-session-id')
  const headers = { ...c.headers, ...(session ? { 'Mcp-Session-Id': session } : {}) }
  await postRpc(c.url, headers, { jsonrpc: '2.0', method: 'notifications/initialized' }, null, f).catch(() => {})
  const list = await postRpc(c.url, headers, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, 2, f)
  return { serverName: init.json.result?.serverInfo?.name ?? 'unknown', serverVersion: init.json.result?.serverInfo?.version ?? '', tools: (list.json.result?.tools ?? []).map((t: any) => ({ name: t.name, description: t.description })) }
}

/** Legacy HTTP+SSE transport: GET the stream, wait for the `endpoint` event, POST requests there and read replies from the stream. */
export async function probeMcpSse(c: Pick<McpConnector, 'url' | 'headers'>, f: typeof fetch = fetch, timeoutMs = 8000): Promise<McpProbe> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await f(c.url, { headers: { Accept: 'text/event-stream', ...c.headers }, signal: ctl.signal })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} from MCP SSE endpoint`)
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    const waiters = new Map<number, (v: any) => void>()
    const st: { endpoint: string | null; onEndpoint?: (u: string) => void } = { endpoint: null }
    const pump = (async () => {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n')
        let i: number
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i)
          buf = buf.slice(i + 2)
          const ev = /^event:\s*(.*)$/m.exec(block)?.[1]?.trim()
          const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('')
          if (ev === 'endpoint') { st.endpoint = new URL(data, c.url).toString(); st.onEndpoint?.(st.endpoint) }
          else if (data) { try { const j = JSON.parse(data); waiters.get(j.id)?.(j) } catch { /* ignore */ } }
        }
      }
    })().catch(() => {})
    if (!st.endpoint) await new Promise<void>((resolve, reject) => { st.onEndpoint = () => resolve(); ctl.signal.addEventListener('abort', () => reject(new Error('Timed out waiting for the SSE endpoint event'))) })
    const call = async (id: number, payload: object) => {
      const p = new Promise<any>((resolve) => waiters.set(id, resolve))
      const r = await f(st.endpoint!, { method: 'POST', headers: { 'Content-Type': 'application/json', ...c.headers }, body: JSON.stringify(payload) })
      if (!r.ok) throw new Error(`HTTP ${r.status} posting to MCP endpoint`)
      const j = await Promise.race([p, new Promise<never>((_, rej) => ctl.signal.addEventListener('abort', () => rej(new Error('Timed out waiting for MCP reply'))))])
      if (j.error) throw new Error(j.error.message ?? 'MCP error')
      return j
    }
    const init = await call(1, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'UnQStudio', version: '1.0.0' } } })
    await f(st.endpoint!, { method: 'POST', headers: { 'Content-Type': 'application/json', ...c.headers }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }).catch(() => {})
    const list = await call(2, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    void pump
    return { serverName: init.result?.serverInfo?.name ?? 'unknown', serverVersion: init.result?.serverInfo?.version ?? '', tools: (list.result?.tools ?? []).map((t: any) => ({ name: t.name, description: t.description })) }
  } finally {
    clearTimeout(timer)
    ctl.abort()
  }
}

export const probeMcp = (c: McpConnector, f: typeof fetch = fetch) => (c.transport === 'sse' ? probeMcpSse(c, f) : probeMcpHttp(c, f))
