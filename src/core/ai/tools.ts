/**
 * Agent tool layer (v3.5): ONE typed tool catalogue, serialised to each provider's native function-calling wire format
 * (openai · anthropic · gemini · ollama), parsed back from native streams/responses, with a universal XML fallback for
 * endpoints/models that reject tool schemas. Pure data + (de)serialisation — execution lives in the store/agent loop.
 *
 * Status: schemas, serialisation, stream accumulation, fallback and parallel-batching are implemented + unit-tested.
 * NOT yet wired into `streamChat` (it still streams text only) — see DOCS/08 (PARTIAL).
 */
export type WireKind = 'openai' | 'anthropic' | 'gemini' | 'ollama'
export type ToolName =
  | 'list_files' | 'read_file' | 'grep_search' | 'find_symbols'
  | 'patch_file' | 'create_file' | 'update_file' | 'delete_file'
  | 'verify_project' | 'inspect_preview' | 'ask_user' | 'update_rules'

export interface JsonSchema { type: 'object'; properties: Record<string, Record<string, unknown>>; required?: string[] }
export interface ToolSpec { name: ToolName; description: string; /** read-only tools may run in parallel within one step */ readOnly: boolean; parameters: JsonSchema }
export interface ToolCall { id: string; name: string; args: Record<string, unknown> }

const str = (description: string) => ({ type: 'string', description })
const int = (description: string) => ({ type: 'integer', description })
const obj = (properties: JsonSchema['properties'], required: string[] = []): JsonSchema => ({ type: 'object', properties, required })

export const TOOL_SPECS: ToolSpec[] = [
  { name: 'list_files', readOnly: true, description: 'List every file in the project with size, line count and lock flag.', parameters: obj({}) },
  { name: 'read_file', readOnly: true, description: 'Read a file with line numbers. Optionally slice with startLine/endLine (1-based, inclusive).', parameters: obj({ path: str('Absolute path, e.g. /src/App.tsx'), startLine: int('First line to return'), endLine: int('Last line to return') }, ['path']) },
  { name: 'grep_search', readOnly: true, description: 'Regex or plain-text search across the whole project. Returns path:line:snippet.', parameters: obj({ pattern: str('Regular expression or literal text'), caseSensitive: { type: 'boolean', description: 'Default false' }, glob: str('Optional path filter such as /src/**/*.tsx') }, ['pattern']) },
  { name: 'find_symbols', readOnly: true, description: 'Query the Project Brain symbol index: exports, components, hooks, props, importers (usedBy).', parameters: obj({ query: str('Symbol name or fragment'), kind: { type: 'string', enum: ['component', 'hook', 'function', 'type', 'store', 'route', 'any'], description: 'Default any' } }, ['query']) },
  { name: 'patch_file', readOnly: false, description: 'Edit an existing file with SEARCH/REPLACE blocks. Required for files over 40 lines.', parameters: obj({ path: str('Absolute path'), patch: str('One or more <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks') }, ['path', 'patch']) },
  { name: 'create_file', readOnly: false, description: 'Create a new file with its complete content.', parameters: obj({ path: str('Absolute path'), content: str('Complete file content') }, ['path', 'content']) },
  { name: 'update_file', readOnly: false, description: 'Replace a (short) file entirely. Prefer patch_file for files over 40 lines.', parameters: obj({ path: str('Absolute path'), content: str('Complete new content') }, ['path', 'content']) },
  { name: 'delete_file', readOnly: false, description: 'Delete a file or folder. Locked paths are refused.', parameters: obj({ path: str('Absolute path') }, ['path']) },
  { name: 'verify_project', readOnly: true, description: 'Run the esbuild build AND the in-browser TypeScript check; returns structured diagnostics {file,line,col,code,message,severity}.', parameters: obj({ typecheck: { type: 'boolean', description: 'Default true' } }) },
  { name: 'inspect_preview', readOnly: true, description: 'Collect console errors, failed network calls, the DOM/layout health audit and (vision models) a screenshot from the live preview.', parameters: obj({ screenshot: { type: 'boolean', description: 'Capture a screenshot when the model supports vision' }, observeMs: int('Observation window, default 4000, max 10000') }) },
  { name: 'ask_user', readOnly: false, description: 'Pause and ask the user a clarifying multiple-choice question. Only when genuinely ambiguous.', parameters: obj({ question: str('The question'), options: { type: 'array', items: { type: 'string' }, description: '2-5 suggested answers' }, allowCustom: { type: 'boolean', description: 'Let the user type a custom answer (default true)' } }, ['question']) },
  { name: 'update_rules', readOnly: false, description: 'Append a VERIFIED project convention to /.unq/rules.md (stack decision, brand voice, pitfall).', parameters: obj({ rule: str('One concise rule'), section: { type: 'string', enum: ['Conventions', 'Stack', 'Brand', 'Pitfalls'], description: 'Default Conventions' } }, ['rule']) },
]
export const toolSpec = (name: string): ToolSpec | undefined => TOOL_SPECS.find((t) => t.name === name)

const clean = (schema: unknown): unknown => JSON.parse(JSON.stringify(schema))

/** Request fragment (merge into the provider body) declaring the tools natively. */
export function toolsForWire(kind: WireKind, specs: ToolSpec[] = TOOL_SPECS): Record<string, unknown> {
  switch (kind) {
    case 'openai': return { tools: specs.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: clean(t.parameters) } })), tool_choice: 'auto' }
    case 'anthropic': return { tools: specs.map((t) => ({ name: t.name, description: t.description, input_schema: clean(t.parameters) })) }
    case 'gemini': return { tools: [{ functionDeclarations: specs.map((t) => ({ name: t.name, description: t.description, ...(Object.keys(t.parameters.properties).length ? { parameters: clean(t.parameters) } : {}) })) }] }
    case 'ollama': return { tools: specs.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: clean(t.parameters) } })) }
  }
}

/** Wire message echoing the assistant's tool calls (must precede the tool results on the next request). */
export function assistantToolCallMessage(kind: WireKind, calls: ToolCall[], text = ''): Record<string, unknown> {
  switch (kind) {
    case 'openai': return { role: 'assistant', content: text || null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) }
    case 'anthropic': return { role: 'assistant', content: [...(text ? [{ type: 'text', text }] : []), ...calls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args }))] }
    case 'gemini': return { role: 'model', parts: [...(text ? [{ text }] : []), ...calls.map((c) => ({ functionCall: { name: c.name, args: c.args } }))] }
    case 'ollama': return { role: 'assistant', content: text, tool_calls: calls.map((c) => ({ function: { name: c.name, arguments: c.args } })) }
  }
}

/** Wire message carrying one tool result back to the model. */
export function toolResultMessage(kind: WireKind, call: ToolCall, result: string): Record<string, unknown> {
  switch (kind) {
    case 'openai': return { role: 'tool', tool_call_id: call.id, content: result }
    case 'anthropic': return { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, content: result }] }
    case 'gemini': return { role: 'user', parts: [{ functionResponse: { name: call.name, response: { result } } }] }
    case 'ollama': return { role: 'tool', tool_name: call.name, content: result }
  }
}

const parseArgs = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === 'object') return v as Record<string, unknown>
  if (typeof v === 'string' && v.trim()) { try { const j = JSON.parse(v); return j && typeof j === 'object' ? j : {} } catch { return {} } }
  return {}
}

/** Accumulates streamed native tool-call fragments (one JSON event at a time) into complete calls. */
export class NativeToolCallAccumulator {
  private openai = new Map<number, { id: string; name: string; args: string }>()
  private anthropic = new Map<number, { id: string; name: string; args: string }>()
  private done: ToolCall[] = []
  private n = 0
  constructor(private kind: WireKind) {}

  push(ev: unknown): void {
    const e = ev as Record<string, any>  
    if (!e || typeof e !== 'object') return
    if (this.kind === 'openai') {
      for (const tc of e.choices?.[0]?.delta?.tool_calls ?? []) {
        const i = typeof tc.index === 'number' ? tc.index : 0
        const cur = this.openai.get(i) ?? { id: '', name: '', args: '' }
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.name += tc.function.name
        if (tc.function?.arguments) cur.args += tc.function.arguments
        this.openai.set(i, cur)
      }
    } else if (this.kind === 'anthropic') {
      if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') this.anthropic.set(e.index, { id: e.content_block.id, name: e.content_block.name, args: '' })
      else if (e.type === 'content_block_delta' && e.delta?.type === 'input_json_delta') { const c = this.anthropic.get(e.index); if (c) c.args += e.delta.partial_json ?? '' }
    } else if (this.kind === 'gemini') {
      for (const p of e.candidates?.[0]?.content?.parts ?? []) if (p.functionCall) this.done.push({ id: `call_${++this.n}`, name: p.functionCall.name, args: parseArgs(p.functionCall.args) })
    } else {
      for (const tc of e.message?.tool_calls ?? []) if (tc.function?.name) this.done.push({ id: `call_${++this.n}`, name: tc.function.name, args: parseArgs(tc.function.arguments) })
    }
  }

  finish(): ToolCall[] {
    const out = [...this.done]
    for (const m of [this.openai, this.anthropic]) for (const [, c] of [...m.entries()].sort((a, b) => a[0] - b[0])) if (c.name) out.push({ id: c.id || `call_${++this.n}`, name: c.name, args: parseArgs(c.args) })
    return out
  }
}

/** Non-streaming response → tool calls. */
export function parseNativeToolCalls(kind: WireKind, json: unknown): ToolCall[] {
  const acc = new NativeToolCallAccumulator(kind)
  const j = json as Record<string, any>  
  if (kind === 'openai') acc.push({ choices: [{ delta: { tool_calls: (j.choices?.[0]?.message?.tool_calls ?? []).map((t: any, i: number) => ({ index: i, ...t })) } }] })  
  else if (kind === 'anthropic') (j.content ?? []).forEach((b: any, i: number) => { if (b.type === 'tool_use') { acc.push({ type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: b.id, name: b.name } }); acc.push({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input ?? {}) } }) } })  
  else acc.push(j)
  return acc.finish()
}

/** True when an HTTP error says the endpoint/model does not accept tool schemas → fall back to XML tags. */
export function isToolUnsupportedError(status: number | undefined, message: string): boolean {
  if (status !== undefined && ![400, 404, 422, 501].includes(status)) return false
  return /tools?\b.*(not support|unsupported|invalid|unknown|not allowed|not available)|(does not|doesn't) support (tool|function)|function[_ ]call.*(not|unsupported)|unrecognized (request )?argument.*tool|tool_choice|unknown field.*tools?/i.test(message)
}

const XML_SELF = /<(list_files|read_file|grep_search|search_project|find_symbols|verify_build|verify_project|inspect_preview)\b([^>]*?)\/?>/g
const attr = (a: string, n: string) => new RegExp(`${n}\\s*=\\s*["']([^"']*)["']`).exec(a)?.[1]
/**
 * Universal fallback: models without native tools emit `<tool name="grep_search">{"pattern":"x"}</tool>` or the legacy
 * self-closing read-only tags of v3.0 (`<read_file path="/a" />`, `<search_project query="x" />`, `<verify_build />`).
 */
export function parseXmlToolCalls(text: string): ToolCall[] {
  const out: ToolCall[] = []
  let n = 0
  for (const m of text.matchAll(/<tool\s+name\s*=\s*["']([a-z_]+)["']\s*>([\s\S]*?)<\/tool>/g)) out.push({ id: `xml_${++n}`, name: m[1], args: parseArgs(m[2].trim()) })
  for (const m of text.matchAll(XML_SELF)) {
    const a = m[2] ?? ''
    const name = m[1] === 'search_project' ? 'grep_search' : m[1] === 'verify_build' ? 'verify_project' : m[1]
    const args: Record<string, unknown> = {}
    const path = attr(a, 'path'); if (path) args.path = path
    const q = attr(a, 'query'); if (q) args[name === 'grep_search' ? 'pattern' : 'query'] = q
    out.push({ id: `xml_${++n}`, name, args })
  }
  return out
}

/** Read-only calls of one step may run concurrently; mutations stay ordered. */
export function partitionCalls(calls: ToolCall[]): { parallel: ToolCall[]; sequential: ToolCall[] } {
  const parallel: ToolCall[] = []
  const sequential: ToolCall[] = []
  for (const c of calls) (toolSpec(c.name)?.readOnly ? parallel : sequential).push(c)
  return { parallel, sequential }
}

/** Minimal JSON-schema argument validation (required + primitive types). Returns an error string or null. */
export function validateToolArgs(call: ToolCall): string | null {
  const spec = toolSpec(call.name)
  if (!spec) return `Unknown tool "${call.name}"`
  for (const r of spec.parameters.required ?? []) if (call.args[r] === undefined || call.args[r] === '') return `${call.name}: missing required argument "${r}"`
  for (const [k, v] of Object.entries(call.args)) {
    const t = spec.parameters.properties[k]?.type
    if (!t) continue
    if (t === 'integer' && !Number.isInteger(v)) return `${call.name}: "${k}" must be an integer`
    if (t === 'string' && typeof v !== 'string') return `${call.name}: "${k}" must be a string`
    if (t === 'boolean' && typeof v !== 'boolean') return `${call.name}: "${k}" must be a boolean`
    if (t === 'array' && !Array.isArray(v)) return `${call.name}: "${k}" must be an array`
  }
  return null
}
