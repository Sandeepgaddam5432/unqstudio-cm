import { slugify } from '@/lib/util'
import { ensureScaffold } from './scaffold'
import type { Snapshot } from './types'
import { isBinaryPath, normalizePath } from './vfs'

const IGNORED = /(^|\/)(node_modules|\.git|dist|\.next|\.DS_Store|__MACOSX)(\/|$)/
const MAX_FILE = 3 * 1024 * 1024

/** Build a runnable Vite + React + TS + Tailwind project zip from a snapshot. */
export async function exportZip(snap: Snapshot, name: string, opts: { scaffold?: boolean } = {}): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const root = slugify(name)
  const text: Record<string, string> = {}
  for (const [p, e] of Object.entries(snap)) if (e.e === 'utf8') text[p] = e.c
  const finalText = opts.scaffold === false ? text : ensureScaffold(text, name)
  for (const [p, c] of Object.entries(finalText)) if (!p.endsWith('/.keep')) zip.file(`${root}${p}`, c)
  for (const [p, e] of Object.entries(snap)) if (e.e === 'base64') zip.file(`${root}${p}`, e.c, { base64: true })
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export interface ImportedProject { files: Snapshot; name?: string; skipped: string[] }

export async function importZip(data: Blob | ArrayBuffer | Uint8Array): Promise<ImportedProject> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(data as ArrayBuffer)
  const entries = Object.values(zip.files).filter((f) => !f.dir && !IGNORED.test(f.name))
  const tops = new Set(entries.map((e) => e.name.split('/')[0]))
  const strip = tops.size === 1 && entries.every((e) => e.name.includes('/')) ? [...tops][0] + '/' : ''
  const files: Snapshot = {}
  const skipped: string[] = []
  for (const e of entries) {
    const path = normalizePath(e.name.slice(strip.length))
    if (path === '/' || /package-lock\.json$|pnpm-lock\.yaml$|yarn\.lock$/.test(path)) continue
    if (isBinaryPath(path)) {
      const b64 = await e.async('base64')
      if (b64.length > MAX_FILE * 1.4) { skipped.push(path); continue }
      files[path] = { c: b64, e: 'base64' }
    } else {
      const bytes = await e.async('uint8array')
      if (bytes.length > MAX_FILE) { skipped.push(path); continue }
      const txt = new TextDecoder('utf-8').decode(bytes)
      if (txt.includes('\u0000')) { skipped.push(path); continue }
      files[path] = { c: txt, e: 'utf8' }
    }
  }
  return { files, name: strip ? strip.replace(/\/$/, '') : undefined, skipped }
}
