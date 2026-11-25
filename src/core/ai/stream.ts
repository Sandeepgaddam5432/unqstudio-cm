import type { ProviderDef } from './providers'
import { ProviderError, type ContentPart, type LLMMessage, type StreamChunk, type StreamRequest } from './types'

/* ── SSE ─────────────────────────────────────────────────── */
export interface SseEvent { event?: string; data: string }

export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const parse = (block: string): SseEvent | null => {
    let event: string | undefined
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    return data.length ? { event, data: data.join('\n') } : null
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const ev = parse(buf.slice(0, i))
        buf = buf.slice(i + 2)
        if (ev) yield ev
      }
    }
    buf += dec.decode()
    if (buf.trim()) {
      const ev = parse(buf.replace(/\r\n/g, '\n'))
      if (ev) yield ev
    }
  } finally {
    reader.releaseLock()
  }
}

/* ── request builders ────────────────────────────────────── */
const NO_STREAM_OPTIONS = new Set(['gemini', 'cohere', 'github', 'perplexity'])
const trimSlash = (s: string) => s.replace(/\/+$/, '')

function oaContent(c: string | ContentPart[]) {
  if (typeof c === 'string') return c
  return c.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: p.dataUrl } }))
}

export function buildOpenAIRequest(req: StreamRequest): { url: string; init: RequestInit } {
  const base = trimSlash(req.baseUrl || req.provider.baseUrl)
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(req.provider.headers ?? {}) }
  if (req.apiKey) headers.Authorization = `Bearer ${req.apiKey}`
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages.map((m) => ({ role: m.role, content: oaContent(m.content) })),
    stream: true,
  }
  if (!NO_STREAM_OPTIONS.has(req.provider.id)) body.stream_options = { include_usage: true }
  if (req.temperature !== undefined) body.temperature = req.temperature
  if (req.maxTokens) body.max_tokens = req.maxTokens
  return { url: `${base}/chat/completions`, init: { method: 'POST', headers, body: JSON.stringify(body), signal: req.signal } }
}

function splitDataUrl(u: string) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(u)
  return { media_type: m?.[1] ?? 'image/png', data: m?.[2] ?? '' }
}

export function buildAnthropicRequest(req: StreamRequest): { url: string; init: RequestInit } {
  const base = trimSlash(req.baseUrl || req.provider.baseUrl)
  const system = req.messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n'))).join('\n\n')
  const messages = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image', source: { type: 'base64', ...splitDataUrl(p.dataUrl) } })),
    }))
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': req.apiKey ?? '',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
  const body: Record<string, unknown> = { model: req.model, max_tokens: req.maxTokens ?? 16000, system, messages, stream: true }
  if (req.temperature !== undefined) body.temperature = req.temperature
  return { url: `${base}/messages`, init: { method: 'POST', headers, body: JSON.stringify(body), signal: req.signal } }
}

/* ── chunk parsers (pure, unit-tested) ───────────────────── */
export function parseOpenAIData(data: string): StreamChunk[] | 'done' {
  if (data.trim() === '[DONE]') return 'done'
  let j: any
  try { j = JSON.parse(data) } catch { return [] }
  if (j.error) throw new ProviderError(typeof j.error === 'string' ? j.error : j.error.message ?? 'Provider error')
  const out: StreamChunk[] = []
  const d = j.choices?.[0]?.delta
  if (d) {
    const r = d.reasoning_content ?? d.reasoning
    if (typeof r === 'string' && r) out.push({ type: 'reasoning', text: r })
    if (typeof d.content === 'string' && d.content) out.push({ type: 'text', text: d.content })
    else if (Array.isArray(d.content)) for (const p of d.content) if (p?.type === 'text' && p.text) out.push({ type: 'text', text: p.text })
  }
  if (j.usage && (j.usage.prompt_tokens != null || j.usage.completion_tokens != null)) {
    out.push({ type: 'usage', usage: { inputTokens: j.usage.prompt_tokens ?? 0, outputTokens: j.usage.completion_tokens ?? 0 } })
  }
  return out
}

export function parseAnthropicEvent(ev: SseEvent, state: { inputTokens: number }): StreamChunk[] | 'done' {
  let j: any
  try { j = JSON.parse(ev.data) } catch { return [] }
  switch (j.type) {
    case 'message_start': state.inputTokens = j.message?.usage?.input_tokens ?? 0; return []
    case 'content_block_delta':
      if (j.delta?.type === 'text_delta') return [{ type: 'text', text: j.delta.text }]
      if (j.delta?.type === 'thinking_delta') return [{ type: 'reasoning', text: j.delta.thinking }]
      return []
    case 'message_delta': return [{ type: 'usage', usage: { inputTokens: state.inputTokens, outputTokens: j.usage?.output_tokens ?? 0 } }]
    case 'message_stop': return 'done'
    case 'error': throw new ProviderError(j.error?.message ?? 'Anthropic error')
    default: return []
  }
}

/* ── network ─────────────────────────────────────────────── */
export async function explainHttpError(res: Response, provider: ProviderDef): Promise<ProviderError> {
  let msg = `${provider.name} returned HTTP ${res.status}`
  try {
    const text = await res.text()
    try {
      const j = JSON.parse(text)
      msg = j.error?.message ?? j.message ?? (typeof j.error === 'string' ? j.error : msg)
    } catch { if (text) msg += `: ${text.slice(0, 200)}` }
  } catch { /* ignore */ }
  const hint =
    res.status === 401 || res.status === 403 ? 'Check that your API key is correct and has access to this model.'
    : res.status === 404 ? 'The model ID or base URL may be wrong.'
    : res.status === 429 ? 'Rate limit or quota exceeded. Try again shortly or switch model/provider.'
    : undefined
  return new ProviderError(msg, res.status, hint)
}

export function explainNetworkError(e: unknown, provider: ProviderDef): ProviderError {
  if (e instanceof ProviderError) return e
  if ((e as Error)?.name === 'AbortError') return Object.assign(new ProviderError('Cancelled'), { name: 'AbortError' })
  const local = provider.local
  return new ProviderError(
    `Could not reach ${provider.name}.`, undefined,
    local ? `Is ${provider.name} running, and are browser origins allowed (CORS)? ${provider.blurb}` : 'The endpoint is unreachable or does not allow direct browser requests (CORS). Check the base URL, your network, or try another provider.',
  )
}

export async function* streamChat(req: StreamRequest): AsyncGenerator<StreamChunk> {
  const f = req.fetchImpl ?? fetch
  const { url, init } = req.provider.kind === 'anthropic' ? buildAnthropicRequest(req) : buildOpenAIRequest(req)
  let res: Response
  try { res = await f(url, init) } catch (e) { throw explainNetworkError(e, req.provider) }
  if (!res.ok) throw await explainHttpError(res, req.provider)
  if (!res.body) throw new ProviderError('The provider returned an empty response body.')
  const state = { inputTokens: 0 }
  try {
    for await (const ev of sseEvents(res.body)) {
      const out = req.provider.kind === 'anthropic' ? parseAnthropicEvent(ev, state) : parseOpenAIData(ev.data)
      if (out === 'done') {
        if (req.provider.kind !== 'anthropic') continue // keep reading: usage may follow [DONE]-less
        return
      }
      for (const c of out) yield c
    }
  } catch (e) { throw explainNetworkError(e, req.provider) }
}

export async function completeOnce(req: StreamRequest): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
  let text = ''
  let usage: { inputTokens: number; outputTokens: number } | undefined
  for await (const c of streamChat(req)) {
    if (c.type === 'text') text += c.text
    else if (c.type === 'usage') usage = c.usage
  }
  return { text, usage }
}

export async function listModels(provider: ProviderDef, apiKey: string | undefined, baseUrl?: string, f: typeof fetch = fetch): Promise<string[]> {
  const base = trimSlash(baseUrl || provider.baseUrl)
  const headers: Record<string, string> = { ...(provider.headers ?? {}) }
  if (provider.kind === 'anthropic') {
    headers['x-api-key'] = apiKey ?? ''
    headers['anthropic-version'] = '2023-06-01'
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  } else if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  let res: Response
  try { res = await f(`${base}/models`, { headers }) } catch (e) { throw explainNetworkError(e, provider) }
  if (!res.ok) throw await explainHttpError(res, provider)
  const j = await res.json()
  const arr: any[] = Array.isArray(j) ? j : j.data ?? j.models ?? []
  return arr.map((m) => (typeof m === 'string' ? m : (m.id ?? m.name ?? '')).replace(/^models\//, '')).filter(Boolean)
}
