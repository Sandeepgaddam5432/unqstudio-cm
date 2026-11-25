/**
 * Streaming parser for the UnQStudio artifact protocol:
 *   <think>…</think>
 *   <create_file path="/src/x.tsx">…</create_file>
 *   <update_file path="…">full content</update_file>
 *   <patch_file path="…"><<<<<<< SEARCH … ======= … >>>>>>> REPLACE</patch_file>
 *   <delete_file path="…" />
 * It is incremental: feed it arbitrary chunks (tags may be split anywhere) and it emits ordered events.
 */
export type FileOpKind = 'create' | 'update' | 'patch'

export type ParserEvent =
  | { type: 'text'; text: string }
  | { type: 'think-start' }
  | { type: 'think-delta'; text: string }
  | { type: 'think-end' }
  | { type: 'file-start'; op: FileOpKind; path: string }
  | { type: 'file-delta'; path: string; text: string }
  | { type: 'file-end'; op: FileOpKind; path: string; content: string; complete: boolean }
  | { type: 'delete'; path: string }

const OPEN_FILE = /^<(create_file|update_file|patch_file)\s+path\s*=\s*["']?([^"'>\s]+)["']?\s*>/
const DELETE = /^<delete_file\s+path\s*=\s*["']?([^"'>\s]+)["']?\s*\/?>/
const STRAY_CLOSE = /^<\/delete_file>/
const TAGS = ['<think>', '<create_file', '<update_file', '<patch_file', '<delete_file', '</delete_file>']
const OP_OF: Record<string, FileOpKind> = { create_file: 'create', update_file: 'update', patch_file: 'patch' }

const couldBePrefix = (b: string) => b.length <= 400 && TAGS.some((t) => t.startsWith(b) || (b.startsWith(t) && !b.includes('>')))

function partialSuffixLen(buf: string, closer: string): number {
  const max = Math.min(buf.length, closer.length - 1)
  for (let n = max; n > 0; n--) if (closer.startsWith(buf.slice(buf.length - n))) return n
  return 0
}

/** Remove a wrapping markdown code fence the model may have added inside a file block. */
export function cleanFileContent(raw: string): string {
  let c = raw
  if (c.startsWith('\n')) c = c.slice(1)
  c = c.replace(/\r\n/g, '\n')
  const fence = /^```[\w+-]*\n([\s\S]*?)\n?```\s*$/.exec(c.trimEnd())
  if (fence) c = fence[1]
  if (c.endsWith('\n')) c = c.slice(0, -1)
  return c
}

export class ArtifactStreamParser {
  private buf = ''
  private state: 'text' | 'think' | 'file' = 'text'
  private cur: { op: FileOpKind; path: string; closer: string; content: string } | null = null

  push(chunk: string): ParserEvent[] {
    this.buf += chunk
    return this.drain(false)
  }

  flush(): ParserEvent[] {
    const out = this.drain(true)
    if (this.state === 'think') {
      if (this.buf) out.push({ type: 'think-delta', text: this.buf })
      out.push({ type: 'think-end' })
    } else if (this.state === 'file' && this.cur) {
      if (this.buf) { this.cur.content += this.buf; out.push({ type: 'file-delta', path: this.cur.path, text: this.buf }) }
      out.push({ type: 'file-end', op: this.cur.op, path: this.cur.path, content: cleanFileContent(this.cur.content), complete: false })
    } else if (this.buf) out.push({ type: 'text', text: this.buf })
    this.buf = ''
    this.state = 'text'
    this.cur = null
    return out
  }

  private drain(final: boolean): ParserEvent[] {
    const out: ParserEvent[] = []
    for (;;) {
      if (this.state === 'text') {
        const i = this.buf.indexOf('<')
        if (i < 0) {
          if (this.buf) out.push({ type: 'text', text: this.buf })
          this.buf = ''
          break
        }
        if (i > 0) {
          out.push({ type: 'text', text: this.buf.slice(0, i) })
          this.buf = this.buf.slice(i)
        }
        if (this.buf.startsWith('<think>')) {
          this.buf = this.buf.slice(7)
          this.state = 'think'
          out.push({ type: 'think-start' })
          continue
        }
        let m = OPEN_FILE.exec(this.buf)
        if (m) {
          this.buf = this.buf.slice(m[0].length)
          if (this.buf.startsWith('\n')) this.buf = this.buf.slice(1)
          this.cur = { op: OP_OF[m[1]], path: m[2], closer: `</${m[1]}>`, content: '' }
          this.state = 'file'
          out.push({ type: 'file-start', op: this.cur.op, path: this.cur.path })
          continue
        }
        m = DELETE.exec(this.buf)
        if (m) {
          this.buf = this.buf.slice(m[0].length)
          out.push({ type: 'delete', path: m[1] })
          continue
        }
        m = STRAY_CLOSE.exec(this.buf)
        if (m) { this.buf = this.buf.slice(m[0].length); continue }
        if (!final && couldBePrefix(this.buf)) break
        out.push({ type: 'text', text: '<' })
        this.buf = this.buf.slice(1)
      } else {
        const closer = this.state === 'think' ? '</think>' : this.cur!.closer
        const idx = this.buf.indexOf(closer)
        if (idx >= 0) {
          const body = this.buf.slice(0, idx)
          this.buf = this.buf.slice(idx + closer.length)
          if (this.state === 'think') {
            if (body) out.push({ type: 'think-delta', text: body })
            out.push({ type: 'think-end' })
          } else {
            const c = this.cur!
            if (body) { c.content += body; out.push({ type: 'file-delta', path: c.path, text: body }) }
            out.push({ type: 'file-end', op: c.op, path: c.path, content: cleanFileContent(c.content), complete: true })
            this.cur = null
          }
          this.state = 'text'
          continue
        }
        const hold = partialSuffixLen(this.buf, closer)
        const safe = this.buf.slice(0, this.buf.length - hold)
        if (safe) {
          if (this.state === 'think') out.push({ type: 'think-delta', text: safe })
          else { this.cur!.content += safe; out.push({ type: 'file-delta', path: this.cur!.path, text: safe }) }
          this.buf = this.buf.slice(safe.length)
        }
        break
      }
    }
    return out
  }
}

/** Collect all events of a complete string (utility for tests / non-streaming use). */
export function parseArtifacts(text: string): ParserEvent[] {
  const p = new ArtifactStreamParser()
  return [...p.push(text), ...p.flush()]
}
