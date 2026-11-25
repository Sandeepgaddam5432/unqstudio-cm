import type { VaultBlob } from '@/core/ai/vault'
import type { CheckpointMeta, FileRecord, IStorageAdapter, ProjectMeta } from './types'

export interface BackupCheckpoint { meta: CheckpointMeta; payload: { compressed: boolean; data: string } }
export interface BackupProject { meta: ProjectMeta; files: FileRecord[]; checkpoints: BackupCheckpoint[] }
export interface BackupFile {
  app: 'unqstudio'
  version: 1
  exportedAt: number
  settings: Record<string, string>
  projects: BackupProject[]
  kv: Array<[string, unknown]>
  vault?: VaultBlob | null
}
export interface BackupOptions { includeCheckpoints?: boolean; includeChats?: boolean; vault?: VaultBlob | null; settings?: Record<string, string> }

const toB64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function createBackup(adapter: IStorageAdapter, opts: BackupOptions = {}): Promise<BackupFile> {
  const projects: BackupProject[] = []
  for (const meta of await adapter.listProjects()) {
    const files = await adapter.listFiles(meta.id)
    const checkpoints: BackupCheckpoint[] = []
    if (opts.includeCheckpoints !== false) {
      for (const cm of await adapter.listCheckpoints(meta.id)) {
        const p = await adapter.getCheckpointPayload(cm.id)
        if (p) checkpoints.push({ meta: cm, payload: { compressed: p.compressed, data: typeof p.data === 'string' ? p.data : toB64(p.data) } })
      }
    }
    projects.push({ meta, files, checkpoints })
  }
  const kv = opts.includeChats === false ? [] : await adapter.kvList('chat:')
  return { app: 'unqstudio', version: 1, exportedAt: Date.now(), settings: opts.settings ?? {}, projects, kv, vault: opts.vault ?? undefined }
}

export function validateBackup(x: unknown): BackupFile {
  const b = x as Partial<BackupFile> | null
  if (!b || b.app !== 'unqstudio' || b.version !== 1 || !Array.isArray(b.projects)) throw new Error('This file is not a valid UnQStudio backup.')
  for (const p of b.projects) if (!p?.meta?.id || !Array.isArray(p.files)) throw new Error('The backup contains a malformed project entry.')
  return b as BackupFile
}

export async function restoreBackup(adapter: IStorageAdapter, backup: BackupFile, mode: 'merge' | 'replace' = 'merge') {
  validateBackup(backup)
  if (mode === 'replace') await adapter.clearAll()
  let files = 0
  for (const p of backup.projects) {
    await adapter.putProject(p.meta)
    await adapter.putFiles(p.files)
    files += p.files.length
    for (const c of p.checkpoints ?? []) {
      await adapter.putCheckpoint(c.meta, { compressed: c.payload.compressed, data: c.payload.compressed ? fromB64(c.payload.data) : c.payload.data })
    }
  }
  for (const [k, v] of backup.kv ?? []) await adapter.kvSet(k, v)
  if (backup.vault) await adapter.kvSet('vault', backup.vault)
  return { projects: backup.projects.length, files }
}
