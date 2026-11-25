import { createBackup, restoreBackup, validateBackup, type BackupFile } from '@/core/vfs/backup'
import type { IStorageAdapter } from '@/core/vfs/types'

/** Name of the single JSON file used by both Drive AppData and Gist sync. */
export const SYNC_FILE = 'unqstudio-backup.json'

/** localStorage keys that must never be synced (machine-local or secret-adjacent). */
const EXCLUDED = /^unq\.(auth|models|session)\b/

type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'>

/** Strip anything that could carry credentials (MCP connector headers) before settings leave the device. */
export function sanitizeSettingValue(key: string, raw: string): string {
  if (key !== 'unq.settings.v1') return raw
  try {
    const j = JSON.parse(raw)
    const mcp = j?.state?.plugins?.mcp
    if (Array.isArray(mcp)) j.state.plugins.mcp = mcp.map((m: Record<string, unknown>) => ({ ...m, headers: {} }))
    return JSON.stringify(j)
  } catch { return raw }
}

export function collectSettings(ls: Store): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i)
    if (k && k.startsWith('unq.') && !EXCLUDED.test(k)) out[k] = sanitizeSettingValue(k, ls.getItem(k) ?? '')
  }
  return out
}

/** Projects + chats + sanitized settings. Never includes the key vault or checkpoints (keeps the payload small and secret-free). */
export async function buildSyncSnapshot(adapter: IStorageAdapter, ls: Store): Promise<BackupFile> {
  return createBackup(adapter, { includeCheckpoints: false, includeChats: true, vault: null, settings: collectSettings(ls) })
}

export const serializeSnapshot = (b: BackupFile): string => JSON.stringify(b)

export function parseSnapshot(text: string): BackupFile {
  let j: unknown
  try { j = JSON.parse(text) } catch { throw new Error('The cloud backup is not valid JSON.') }
  return validateBackup(j)
}

/** Merge-restore a cloud snapshot into local storage. Local-only keys and the vault are left untouched. */
export async function applySnapshot(adapter: IStorageAdapter, b: BackupFile, ls: Store): Promise<{ projects: number; files: number }> {
  const res = await restoreBackup(adapter, { ...b, vault: undefined }, 'merge')
  for (const [k, v] of Object.entries(b.settings ?? {})) if (k.startsWith('unq.') && !EXCLUDED.test(k)) ls.setItem(k, v)
  return res
}
