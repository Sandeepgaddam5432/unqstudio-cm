import { isBinaryPath, normalizePath } from './vfs'
import type { Snapshot } from './types'

/** Minimal structural types for the File System Access API (not in lib.dom for every TS version). */
export interface DirHandle {
  kind: 'directory'
  name: string
  entries(): AsyncIterable<[string, DirHandle | FileHandle]>
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FileHandle>
  queryPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}
export interface FileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(d: string | Blob | BufferSource): Promise<void>; close(): Promise<void> }>
}

export const isFsAccessSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export async function pickDirectory(): Promise<DirHandle> {
  const w = window as unknown as { showDirectoryPicker(o?: object): Promise<DirHandle> }
  return w.showDirectoryPicker({ mode: 'readwrite' })
}

export async function ensurePermission(dir: DirHandle, mode: 'read' | 'readwrite' = 'readwrite'): Promise<boolean> {
  if (!dir.queryPermission) return true
  if ((await dir.queryPermission({ mode })) === 'granted') return true
  return (await dir.requestPermission?.({ mode })) === 'granted'
}

const SKIP = new Set(['node_modules', '.git', 'dist', '.next', '.DS_Store'])
const MAX_BYTES = 2 * 1024 * 1024

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function writeSnapshotToDirectory(dir: DirHandle, snap: Snapshot): Promise<number> {
  let n = 0
  for (const [path, e] of Object.entries(snap)) {
    if (path.endsWith('/.keep')) continue
    const parts = path.split('/').filter(Boolean)
    let d = dir
    for (const seg of parts.slice(0, -1)) d = await d.getDirectoryHandle(seg, { create: true })
    const fh = await d.getFileHandle(parts[parts.length - 1], { create: true })
    const w = await fh.createWritable()
    await w.write(e.e === 'base64' ? (b64ToBytes(e.c) as unknown as BufferSource) : e.c)
    await w.close()
    n++
  }
  return n
}

export async function readDirectoryToSnapshot(dir: DirHandle, prefix = ''): Promise<Snapshot> {
  const out: Snapshot = {}
  for await (const [name, h] of dir.entries()) {
    if (SKIP.has(name)) continue
    const p = normalizePath(`${prefix}/${name}`)
    if (h.kind === 'directory') Object.assign(out, await readDirectoryToSnapshot(h, p))
    else {
      const f = await h.getFile()
      if (f.size > MAX_BYTES) continue
      if (isBinaryPath(p)) out[p] = { c: bytesToB64(new Uint8Array(await f.arrayBuffer())), e: 'base64' }
      else {
        const t = await f.text()
        if (!t.includes('\u0000')) out[p] = { c: t, e: 'utf8' }
      }
    }
  }
  return out
}
