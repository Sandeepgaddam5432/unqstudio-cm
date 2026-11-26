/** Pure helpers behind the Visual Click-to-Edit inspector: map DOM edits back to source files. */
export interface InspectedInfo { tag: string; classes: string; text: string; editableText?: boolean; html?: string; selector?: string }
export interface QuickEdit { text?: string; color?: string; bg?: string; padding?: number; radius?: number; fontSize?: number; fontWeight?: number }

export function rgbToHex(rgb: string): string {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(rgb)
  if (!m) return /^#[0-9a-f]{6}$/i.test(rgb) ? rgb : '#000000'
  if (m[4] !== undefined && Number(m[4]) === 0) return '#ffffff'
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
}

const TEXT_NON_COLOR = /^text-(xs|sm|base|lg|xl|\dxl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|\[(?:\d|calc|length:)[^\]]*\])$/
const FONT_SIZE = /^text-(xs|sm|base|lg|xl|\dxl|\[\d[^\]]*(px|rem|em)\]|\[length:[^\]]*\])$/

const isTextColor = (c: string) => c.startsWith('text-') && !TEXT_NON_COLOR.test(c)
const isBg = (c: string) => /^bg-/.test(c) && !/^bg-(gradient|none|clip|cover|center|no-repeat|fixed|local|scroll|repeat|origin|blend|linear|radial|conic|\[url)/.test(c)
const isPadding = (c: string) => /^p-/.test(c)
const isRadius = (c: string) => /^rounded(-|$)/.test(c) && !/^rounded-(t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)(-|$)/.test(c)

/** Replace conflicting Tailwind utilities with arbitrary-value classes expressing the edit. */
export function applyQuickEditToClasses(classes: string, e: QuickEdit): string {
  let list = classes.split(/\s+/).filter(Boolean)
  const strip = (f: (c: string) => boolean) => { list = list.filter((c) => { const base = c.includes(':') ? c.slice(c.lastIndexOf(':') + 1) : c; return c.includes(':') ? true : !f(base) }) }
  if (e.color) { strip(isTextColor); list.push(`text-[${e.color}]`) }
  if (e.bg) { strip(isBg); list.push(`bg-[${e.bg}]`) }
  if (e.padding !== undefined) { strip(isPadding); list.push(`p-[${Math.round(e.padding)}px]`) }
  if (e.radius !== undefined) { strip(isRadius); list.push(`rounded-[${Math.round(e.radius)}px]`) }
  if (e.fontSize !== undefined) { strip((c) => FONT_SIZE.test(c)); list.push(`text-[${Math.round(e.fontSize)}px]`) }
  if (e.fontWeight !== undefined) { strip((c) => /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[\d+\])$/.test(c)); list.push(`font-[${Math.round(e.fontWeight)}]`) }
  return list.join(' ')
}

const SOURCE_FILE = /^\/(index\.html|src\/.*\.(tsx|jsx|ts|js|html))$/

function lineOf(content: string, idx: number) { return content.slice(0, idx).split('\n').length }
function countOccurrences(hay: string, needle: string) { let n = 0; for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) n++; return n }

export function findSourceHint(files: Record<string, string>, info: Pick<InspectedInfo, 'classes' | 'text'>): { path: string; line: number } | null {
  for (const [path, c] of Object.entries(files)) {
    if (!SOURCE_FILE.test(path)) continue
    if (info.classes) {
      for (const q of ['"', "'", '`']) { const i = c.indexOf(q + info.classes + q); if (i >= 0) return { path, line: lineOf(c, i) } }
    }
  }
  if (info.text) for (const [path, c] of Object.entries(files)) { if (!SOURCE_FILE.test(path)) continue; const i = c.indexOf(info.text); if (i >= 0) return { path, line: lineOf(c, i) } }
  return null
}

export interface SourceEditPlan { files: Record<string, string>; applied: string[]; failed: string[] }

export function planSourceEdit(files: Record<string, string>, info: InspectedInfo, e: QuickEdit): SourceEditPlan {
  const out: Record<string, string> = {}
  const applied: string[] = []
  const failed: string[] = []
  const current = (p: string) => out[p] ?? files[p]
  const candidates = Object.keys(files).filter((p) => SOURCE_FILE.test(p))

  const replaceUnique = (needle: string, replacement: string, label: string, quoted: boolean) => {
    const variants = quoted ? ['"', "'", '`'].map((q) => q + needle + q) : [needle]
    const hits: Array<{ path: string; v: string }> = []
    for (const p of candidates) for (const v of variants) { const n = countOccurrences(current(p), v); for (let i = 0; i < n; i++) hits.push({ path: p, v }) }
    if (hits.length === 0) return failed.push(`${label}: not found in source (it may be generated dynamically) — use “Edit with AI”.`)
    if (hits.length > 1) return failed.push(`${label}: ${hits.length} identical matches in source, so the right one is ambiguous — use “Edit with AI”.`)
    const { path, v } = hits[0]
    const rep = quoted ? v[0] + replacement + v[0] : replacement
    out[path] = current(path).replace(v, () => rep)
    applied.push(`${label} → ${path}`)
  }

  if (e.text !== undefined && info.text && e.text !== info.text) replaceUnique(info.text, e.text, 'Text', false)
  const styleEdit = e.color || e.bg || e.padding !== undefined || e.radius !== undefined || e.fontSize !== undefined || e.fontWeight !== undefined
  if (styleEdit) {
    if (!info.classes.trim()) failed.push('Styles: this element has no class names to edit — use “Edit with AI”.')
    else replaceUnique(info.classes, applyQuickEditToClasses(info.classes, e), 'Styles', true)
  }
  return { files: out, applied, failed }
}

export function buildInspectorPrompt(info: InspectedInfo, hint: { path: string; line: number } | null): string {
  return (
    `Edit this element in the live preview:\n\n\`\`\`html\n${(info.html ?? `<${info.tag}>`).slice(0, 900)}\n\`\`\`\n\n` +
    `Tag: <${info.tag}>${info.classes ? `\nClasses: ${info.classes}` : ''}${info.selector ? `\nDOM path: ${info.selector}` : ''}` +
    (hint ? `\nLikely source: ${hint.path}:${hint.line}` : '') +
    `\n\nChange: `
  )
}

/** Chat message for the inline “Ask AI to edit this element” box: the exact DOM node, classes and source hint plus the user's request. */
export function composeAskPrompt(info: InspectedInfo, hint: { path: string; line: number } | null, request: string): string {
  return `${buildInspectorPrompt(info, hint)}\n\nRequested change: ${request.trim()}`
}
