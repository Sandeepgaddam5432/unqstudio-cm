// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  NativeToolCallAccumulator, TOOL_SPECS, assistantToolCallMessage, isToolUnsupportedError, parseNativeToolCalls, parseXmlToolCalls, partitionCalls, toolResultMessage, toolsForWire, validateToolArgs,
  type WireKind,
} from './tools'

describe('tool catalogue', () => {
  it('declares all 12 agent tools with unique names; mutations are not read-only', () => {
    expect(TOOL_SPECS.map((t) => t.name).sort()).toEqual(['ask_user', 'create_file', 'delete_file', 'find_symbols', 'grep_search', 'inspect_preview', 'list_files', 'patch_file', 'read_file', 'update_file', 'update_rules', 'verify_project'])
    expect(TOOL_SPECS.filter((t) => t.readOnly).map((t) => t.name).sort()).toEqual(['find_symbols', 'grep_search', 'inspect_preview', 'list_files', 'read_file', 'verify_project'])
  })
})

describe('native serialisation — 4 wire protocols', () => {
  it('openai: function tools + tool_choice', () => {
    const w = toolsForWire('openai') as any
    expect(w.tool_choice).toBe('auto')
    expect(w.tools[0]).toMatchObject({ type: 'function', function: { name: 'list_files', parameters: { type: 'object' } } })
    expect(w.tools).toHaveLength(12)
  })
  it('anthropic: input_schema', () => {
    const w = toolsForWire('anthropic') as any
    const read = w.tools.find((t: any) => t.name === 'read_file')
    expect(read.input_schema.required).toEqual(['path'])
    expect(read.parameters).toBeUndefined()
  })
  it('gemini: one functionDeclarations group; parameterless tools omit `parameters`', () => {
    const w = toolsForWire('gemini') as any
    expect(w.tools).toHaveLength(1)
    const decl = w.tools[0].functionDeclarations
    expect(decl.find((d: any) => d.name === 'list_files').parameters).toBeUndefined()
    expect(decl.find((d: any) => d.name === 'grep_search').parameters.required).toEqual(['pattern'])
  })
  it('ollama: openai-style function tools', () => {
    expect((toolsForWire('ollama') as any).tools[1].function.name).toBe('read_file')
  })
  it('tool-result + assistant echo messages use each protocol’s shape', () => {
    const call = { id: 'c1', name: 'read_file', args: { path: '/a.ts' } }
    expect(toolResultMessage('openai', call, 'ok')).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'ok' })
    expect(toolResultMessage('anthropic', call, 'ok')).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'ok' }] })
    expect((toolResultMessage('gemini', call, 'ok') as any).parts[0].functionResponse).toEqual({ name: 'read_file', response: { result: 'ok' } })
    expect(toolResultMessage('ollama', call, 'ok')).toMatchObject({ role: 'tool', tool_name: 'read_file' })
    expect((assistantToolCallMessage('openai', [call]) as any).tool_calls[0].function.arguments).toBe('{"path":"/a.ts"}')
    expect((assistantToolCallMessage('anthropic', [call], 'hi') as any).content.map((b: any) => b.type)).toEqual(['text', 'tool_use'])
    expect((assistantToolCallMessage('gemini', [call]) as any).role).toBe('model')
    expect((assistantToolCallMessage('ollama', [call]) as any).tool_calls[0].function.arguments).toEqual({ path: '/a.ts' })
  })
})

describe('native tool-call parsing (stream + final) incl. PARALLEL calls', () => {
  it('openai: reassembles interleaved argument fragments of two parallel calls', () => {
    const a = new NativeToolCallAccumulator('openai')
    a.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'read_file', arguments: '{"pa' } }, { index: 1, id: 'b', function: { name: 'grep_search', arguments: '{"pattern":' } }] } }] })
    a.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"/x.ts"}' } }, { index: 1, function: { arguments: '"foo"}' } }] } }] })
    expect(a.finish()).toEqual([{ id: 'a', name: 'read_file', args: { path: '/x.ts' } }, { id: 'b', name: 'grep_search', args: { pattern: 'foo' } }])
  })
  it('anthropic: tool_use blocks with input_json_delta', () => {
    const a = new NativeToolCallAccumulator('anthropic')
    a.push({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't1', name: 'read_file' } })
    a.push({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":' } })
    a.push({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"/a.ts"}' } })
    a.push({ type: 'content_block_start', index: 0, content_block: { type: 'text' } })
    expect(a.finish()).toEqual([{ id: 't1', name: 'read_file', args: { path: '/a.ts' } }])
  })
  it('gemini + ollama: whole functionCall / tool_calls objects', () => {
    const g = new NativeToolCallAccumulator('gemini')
    g.push({ candidates: [{ content: { parts: [{ functionCall: { name: 'list_files', args: {} } }, { functionCall: { name: 'read_file', args: { path: '/a' } } }] } }] })
    expect(g.finish().map((c) => c.name)).toEqual(['list_files', 'read_file'])
    const o = new NativeToolCallAccumulator('ollama')
    o.push({ message: { tool_calls: [{ function: { name: 'grep_search', arguments: { pattern: 'x' } } }] } })
    expect(o.finish()[0]).toMatchObject({ name: 'grep_search', args: { pattern: 'x' } })
  })
  it('round-trips non-streaming responses for every protocol', () => {
    const kinds: [WireKind, unknown][] = [
      ['openai', { choices: [{ message: { tool_calls: [{ id: 'z', type: 'function', function: { name: 'read_file', arguments: '{"path":"/q"}' } }] } }] }],
      ['anthropic', { content: [{ type: 'text', text: 'x' }, { type: 'tool_use', id: 'z', name: 'read_file', input: { path: '/q' } }] }],
      ['gemini', { candidates: [{ content: { parts: [{ functionCall: { name: 'read_file', args: { path: '/q' } } }] } }] }],
      ['ollama', { message: { tool_calls: [{ function: { name: 'read_file', arguments: { path: '/q' } } }] } }],
    ]
    for (const [k, j] of kinds) expect(parseNativeToolCalls(k, j).map((c) => [c.name, c.args])).toEqual([['read_file', { path: '/q' }]])
  })
  it('malformed argument JSON degrades to {} (validation then reports the missing field)', () => {
    const a = new NativeToolCallAccumulator('openai')
    a.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'read_file', arguments: '{"pa' } }] } }] })
    const [c] = a.finish()
    expect(c.args).toEqual({})
    expect(validateToolArgs(c)).toMatch(/missing required argument "path"/)
  })
})

describe('XML fallback + batching + validation', () => {
  it('parses <tool> JSON blocks and legacy self-closing tags', () => {
    const calls = parseXmlToolCalls('<tool name="grep_search">{"pattern":"useState"}</tool> then <read_file path="/a.ts" /> <search_project query="x" /> <verify_build />')
    expect(calls.map((c) => [c.name, c.args])).toEqual([['grep_search', { pattern: 'useState' }], ['read_file', { path: '/a.ts' }], ['grep_search', { pattern: 'x' }], ['verify_project', {}]])
  })
  it('detects "endpoint does not support tools" so the loop can fall back', () => {
    expect(isToolUnsupportedError(400, 'This model does not support tools')).toBe(true)
    expect(isToolUnsupportedError(400, 'tools is not supported for this model')).toBe(true)
    expect(isToolUnsupportedError(401, 'tools not supported')).toBe(false)
    expect(isToolUnsupportedError(400, 'max_tokens too large')).toBe(false)
  })
  it('runs read-only calls in parallel and keeps mutations ordered', () => {
    const { parallel, sequential } = partitionCalls([
      { id: '1', name: 'read_file', args: { path: '/a' } }, { id: '2', name: 'patch_file', args: {} }, { id: '3', name: 'grep_search', args: { pattern: 'x' } }, { id: '4', name: 'create_file', args: {} },
    ])
    expect(parallel.map((c) => c.id)).toEqual(['1', '3'])
    expect(sequential.map((c) => c.id)).toEqual(['2', '4'])
  })
  it('validates arguments', () => {
    expect(validateToolArgs({ id: '1', name: 'nope', args: {} })).toMatch(/Unknown tool/)
    expect(validateToolArgs({ id: '1', name: 'read_file', args: { path: '/a', startLine: 1.5 } })).toMatch(/integer/)
    expect(validateToolArgs({ id: '1', name: 'read_file', args: { path: '/a', startLine: 2 } })).toBeNull()
  })
})
