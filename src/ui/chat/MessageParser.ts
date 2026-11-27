/**
 * Leak-proof assistant text parser (v3.2). Splits streamed OR completed assistant text into clean prose and tool segments so raw
 * `<|tool_call:start|>`, `<patch_file>`, `<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE`, `</patch_file>` never reach the chat prose.
 * Works on partial text (unterminated blocks are swallowed while streaming and rendered as in-progress cards).
 */
export type ToolKind = 'Create' | 'Rewrite' | 'Patch' | 'Delete' | 'Tool'
export interface SearchReplace { search: string; replace: string }
export interface ToolSeg { kind: 'tool'; tool: ToolKind; path?: string; body: string; pairs: SearchReplace[]; done: boolean }
export interface ProseSeg { kind: 'prose'; text: string }
export type Seg = ProseSeg | ToolSeg

const TC_START = /<\|\s*tool[_ ]?calls?\s*[:_ ]?\s*(?:start|begin)\s*\|>/i
const TC_END = /<\|\s*tool[_ ]?calls?\s*[:_ ]?\s*(?:end|stop)\s*\|>/i
const XML_OPEN = /<(create_file|update_file|patch_file|delete_file)\b([^>]*)>/i
const FENCE_PATCH = /```[\w-]*[ \t]*\n(?=(?:(?!```)[\s\S])*?<{7} SEARCH)/
const RAW_PATCH = /^[ \t]*<{7} SEARCH[ \t]*$/m
const RAW_END = />{7} REPLACE[^\n]*/
const STRAY_LINE = /^\s*(?:<{7} SEARCH|={7}|>{7} REPLACE|<\/?patch_file>|<\/?(?:create|update|delete)_file>|<\/tool_call>)\s*$/
const PARTIALS = ['<|tool_call:start|>', '<|tool_call:end|>', '<patch_file', '<create_file', '<update_file', '<delete_file', '</patch_file>', '<<<<<<< SEARCH', '>>>>>>> REPLACE']

/** `<<<<<<< SEARCH … ======= … >>>>>>> REPLACE` blocks (tolerates a missing tail while streaming). */
export function extractPairs(body: string): SearchReplace[] {
  const out: SearchReplace[] = []
  const re = /<{7} SEARCH[ \t]*\n([\s\S]*?)\n?={7}[ \t]*\n([\s\S]*?)\n?>{7} REPLACE/g
  let last = 0
  for (const m of body.matchAll(re)) { out.push({ search: m[1] ?? '', replace: m[2] ?? '' }); last = (m.index ?? 0) + m[0].length }
  const tail = body.slice(last)
  const open = /<{7} SEARCH[ \t]*\n([\s\S]*)$/.exec(tail)
  if (open) {
    const [s, r] = open[1]!.split(/\n?={7}[ \t]*\n?/)
    out.push({ search: s ?? '', replace: r ?? '' })
  }
  return out
}

const attr = (attrs: string, name: string) => new RegExp(`${name}\\s*=\\s*["']?([^"'>\\s]+)["']?`, 'i').exec(attrs)?.[1]

function fromToolCall(body: string, done: boolean): ToolSeg {
  const trimmed = body.trim()
  let name: string, path: string | undefined, content = '', diff = ''
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>
    const args = (typeof o.arguments === 'object' && o.arguments ? o.arguments : typeof o.args === 'object' && o.args ? o.args : o) as Record<string, unknown>
    name = String(o.name ?? o.tool ?? o.function ?? '')
    const p = args.path ?? args.file_path ?? args.filename ?? args.file
    path = typeof p === 'string' ? p : undefined
    const c = args.content ?? args.file_text ?? args.code ?? args.new_content
    content = typeof c === 'string' ? c : ''
    const d = args.diff ?? args.patch ?? args.search_replace
    diff = typeof d === 'string' ? d : ''
  } catch {
    name = /"?name"?\s*[:=]\s*"?([\w.-]+)/i.exec(trimmed)?.[1] ?? ''
    path = /"?(?:path|file_path|filename)"?\s*[:=]\s*"([^"\n]+)"/i.exec(trimmed)?.[1]
  }
  const pairs = extractPairs(diff || trimmed)
  let tool: ToolKind = 'Tool'
  if (/delete|remove/i.test(name)) tool = 'Delete'
  else if (pairs.length || /patch|diff|search/i.test(name)) tool = 'Patch'
  else if (/create|write|add|new/i.test(name)) tool = 'Create'
  else if (/update|rewrite|edit|replace/i.test(name)) tool = 'Rewrite'
  return { kind: 'tool', tool, path, body: content || (pairs.length ? '' : trimmed), pairs, done }
}

function cleanProse(t: string): string {
  return t.split('\n').filter((l) => !STRAY_LINE.test(l)).join('\n').replace(/<\|[^|>\n]{0,48}\|>/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

export function parseMessageText(text: string, streaming = false): Seg[] {
  const segs: Seg[] = []
  const prose = (t: string) => { const c = cleanProse(t); if (c) segs.push({ kind: 'prose', text: c }) }
  let rest = text.replace(/\r\n/g, '\n')
  for (let guard = 0; rest && guard < 200; guard++) {
    const cands: { i: number; len: number; kind: 'tc' | 'xml' | 'fence' | 'raw'; m: RegExpExecArray }[] = []
    for (const [re, kind] of [[TC_START, 'tc'], [XML_OPEN, 'xml'], [FENCE_PATCH, 'fence'], [RAW_PATCH, 'raw']] as const) {
      const m = re.exec(rest)
      if (m) cands.push({ i: m.index, len: kind === 'raw' ? 0 : m[0].length, kind, m })
    }
    if (!cands.length) { prose(rest); break }
    const hit = cands.sort((a, b) => a.i - b.i)[0]!
    prose(rest.slice(0, hit.i))
    rest = rest.slice(hit.i + hit.len)
    if (hit.kind === 'tc') {
      const e = TC_END.exec(rest)
      const body = e ? rest.slice(0, e.index) : rest
      rest = e ? rest.slice(e.index + e[0].length) : ''
      segs.push(fromToolCall(body, !!e || !streaming))
    } else if (hit.kind === 'xml') {
      const tag = hit.m[1]!.toLowerCase(), attrs = hit.m[2] ?? ''
      const path = attr(attrs, 'path')
      if (tag === 'delete_file' && /\/\s*$/.test(attrs)) { segs.push({ kind: 'tool', tool: 'Delete', path, body: '', pairs: [], done: true }); continue }
      const closer = `</${tag}>`
      const idx = rest.toLowerCase().indexOf(closer)
      const body = idx >= 0 ? rest.slice(0, idx) : rest
      rest = idx >= 0 ? rest.slice(idx + closer.length) : ''
      const tool: ToolKind = tag === 'patch_file' ? 'Patch' : tag === 'create_file' ? 'Create' : tag === 'delete_file' ? 'Delete' : 'Rewrite'
      segs.push({ kind: 'tool', tool, path, body: tool === 'Patch' ? '' : body.replace(/^\n/, ''), pairs: tool === 'Patch' ? extractPairs(body) : [], done: idx >= 0 || !streaming })
    } else if (hit.kind === 'fence') {
      const idx = rest.indexOf('```')
      const body = idx >= 0 ? rest.slice(0, idx) : rest
      rest = idx >= 0 ? rest.slice(idx + 3) : ''
      segs.push({ kind: 'tool', tool: 'Patch', body: '', pairs: extractPairs(body), done: idx >= 0 || !streaming })
    } else {
      const e = RAW_END.exec(rest)
      const body = e ? rest.slice(0, e.index + e[0].length) : rest
      rest = e ? rest.slice(e.index + e[0].length) : ''
      segs.push({ kind: 'tool', tool: 'Patch', body: '', pairs: extractPairs(body), done: !!e || !streaming })
    }
  }
  if (streaming) {
    const last = segs[segs.length - 1]
    if (last?.kind === 'prose') {
      const i = last.text.lastIndexOf('<')
      if (i >= 0 && last.text.length - i <= 24) {
        const suffix = last.text.slice(i)
        if (PARTIALS.some((p) => p.startsWith(suffix))) { last.text = last.text.slice(0, i).trimEnd(); if (!last.text) segs.pop() }
      }
    }
  }
  return segs
}

/** Prose only (for chat-list previews, search, copy-text): tool/patch blocks removed. */
export function proseOnly(text: string, streaming = false): string {
  return parseMessageText(text, streaming).filter((s): s is ProseSeg => s.kind === 'prose').map((s) => s.text).join('\n\n')
}

/** True when the text still contains raw protocol markers (used by tests / e2e). */
export function hasProtocolLeak(text: string): boolean {
  return /<\|\s*tool[_ ]?call|<\/?patch_file|<{7} SEARCH|>{7} REPLACE|^\s*={7}\s*$/m.test(text)
}
