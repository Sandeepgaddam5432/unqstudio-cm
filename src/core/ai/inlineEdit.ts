// Cursor-style inline ⌘K edit: pure helpers (line-range expansion, splice, reply cleanup, prompt, diff preview).
import { diffLines } from 'diff'
import type { LLMMessage } from './types'

export interface LineRange { from: number; to: number; text: string; startLine: number; endLine: number }

/** Expand an arbitrary selection to WHOLE lines (so the model replaces complete lines only). `to` is exclusive of the trailing newline. */
export function expandToLines(doc: string, from: number, to: number): LineRange {
  const a = Math.max(0, Math.min(from, to)), b = Math.min(doc.length, Math.max(from, to))
  const start = doc.lastIndexOf('\n', a - 1) + 1
  // a selection that ends exactly at a line start (after a newline) should not drag that next line in
  const endRef = b > a && doc[b - 1] === '\n' ? b - 1 : b
  const nl = doc.indexOf('\n', endRef)
  const end = nl === -1 ? doc.length : nl
  const startLine = doc.slice(0, start).split('\n').length
  const text = doc.slice(start, end)
  return { from: start, to: end, text, startLine, endLine: startLine + text.split('\n').length - 1 }
}

export const spliceRange = (doc: string, from: number, to: number, replacement: string): string => doc.slice(0, from) + replacement + doc.slice(to)

/** Strip ``` fences / chatter the model may add; keeps inner indentation, drops a single trailing newline. */
export function extractReplacement(raw: string): string {
  let t = raw.replace(/\r\n/g, '\n')
  const fence = /```[\w+-]*\n([\s\S]*?)```/.exec(t)
  if (fence) t = fence[1]!
  else t = t.replace(/^```[\w+-]*\n?/, '').replace(/\n?```\s*$/, '')
  return t.replace(/\n$/, '')
}

export function buildInlineMessages(a: { path: string; before: string; selected: string; after: string; instruction: string }): LLMMessage[] {
  return [
    { role: 'system', content: 'You are an inline code editor inside an IDE. Rewrite ONLY the SELECTED lines according to the instruction. Reply with the replacement lines ONLY — no markdown fences, no explanations, no surrounding code. Preserve indentation and keep the replacement compatible with the code before and after it.' },
    { role: 'user', content: `File: ${a.path}\n\n<before>\n${a.before}\n</before>\n<selected>\n${a.selected}\n</selected>\n<after>\n${a.after}\n</after>\n\nInstruction: ${a.instruction.trim()}` },
  ]
}

/** Up to `ctx` lines of surrounding code (so prompts stay small on large files). */
export function surroundingContext(doc: string, r: LineRange, ctx = 40): { before: string; after: string } {
  const before = doc.slice(0, r.from).replace(/\n$/, '').split('\n').slice(-ctx).join('\n')
  const after = doc.slice(r.to).replace(/^\n/, '').split('\n').slice(0, ctx).join('\n')
  return { before, after }
}

export interface DiffLine { type: 'add' | 'del' | 'same'; text: string }
/** Line diff for the inline Green/Red preview. */
export function diffPreview(oldText: string, newText: string): DiffLine[] {
  const out: DiffLine[] = []
  for (const part of diffLines(oldText, newText)) {
    const type = part.added ? 'add' : part.removed ? 'del' : 'same'
    for (const l of part.value.replace(/\n$/, '').split('\n')) out.push({ type, text: l })
  }
  return out
}
