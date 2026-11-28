import { countLineChanges } from '@/core/vfs/lineDiff'
import { FileLockedError, normalizePath, type VirtualFileSystem } from '@/core/vfs/vfs'
import { applyPatch, parsePatchBlocks } from './patch'
import type { FileOpKind } from './parser'

export type OpStatus = 'streaming' | 'pending' | 'applied' | 'skipped-locked' | 'failed' | 'rejected' | 'interrupted'
export interface OpRecord {
  id: string
  op: FileOpKind | 'delete'
  path: string
  status: OpStatus
  detail?: string
  added: number
  removed: number
  /** Raw payload kept while pending approval (full content, or patch body). */
  content?: string
  before?: string
  after?: string
  lines?: number
  /** v3.4: everything streamed before the file was cut off (status 'interrupted'). Never discarded; powers Resume. */
  partial?: string
  interruptedReason?: string
}

export interface OpResult { status: OpStatus; detail?: string; added: number; removed: number; before?: string; after?: string }

const FORBIDDEN = /^\/(node_modules|\.git)(\/|$)/

/** Apply one AI file operation to the VFS, honouring locks. Never throws. */
export async function applyOp(vfs: VirtualFileSystem, op: FileOpKind | 'delete', rawPath: string, content = ''): Promise<OpResult> {
  const path = normalizePath(rawPath)
  if (path === '/' || FORBIDDEN.test(path)) return { status: 'failed', detail: `Invalid path: ${rawPath}`, added: 0, removed: 0 }
  try {
    const before = vfs.read(path)
    if (op === 'delete') {
      if (before === undefined && !vfs.isFolder(path)) return { status: 'failed', detail: 'File does not exist', added: 0, removed: 0 }
      await vfs.remove(path, { actor: 'ai' })
      return { status: 'applied', added: 0, removed: before ? before.split('\n').length : 0, before }
    }
    if (op === 'patch') {
      if (before === undefined) return { status: 'failed', detail: 'Cannot patch a file that does not exist – use create_file', added: 0, removed: 0 }
      if (vfs.isLocked(path)) throw new FileLockedError(path, vfs.lockedBy(path)!)
      const res = applyPatch(before, parsePatchBlocks(content))
      if (!res.ok) return { status: 'failed', detail: res.failures.map((f) => `Block ${f.index + 1}: ${f.reason}`).join('; '), added: 0, removed: 0, before }
      await vfs.write(path, res.content, { actor: 'ai' })
      const c = countLineChanges(before, res.content)
      return { status: 'applied', detail: `${res.applied} block${res.applied === 1 ? '' : 's'}`, ...c, before, after: res.content }
    }
    await vfs.write(path, content, { actor: 'ai' })
    const c = countLineChanges(before ?? '', content)
    return { status: 'applied', ...c, before, after: content }
  } catch (e) {
    if (e instanceof FileLockedError) return { status: 'skipped-locked', detail: `Locked by you${e.lockedBy !== path ? ` (folder ${e.lockedBy})` : ''} – the agent may not change it`, added: 0, removed: 0 }
    return { status: 'failed', detail: e instanceof Error ? e.message : String(e), added: 0, removed: 0 }
  }
}
