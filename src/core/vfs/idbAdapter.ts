import { openDB, type IDBPDatabase } from 'idb'
import type { CheckpointMeta, CheckpointPayload, FileRecord, IStorageAdapter, ProjectMeta, StorageStats } from './types'
import { MemoryAdapter } from './memoryAdapter'

const DB_VERSION = 1

export class IdbAdapter implements IStorageAdapter {
  readonly kind = 'indexeddb'
  private dbp: Promise<IDBPDatabase>

  constructor(name = 'unqstudio') {
    this.dbp = openDB(name, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' })
        const f = db.createObjectStore('files', { keyPath: ['projectId', 'path'] })
        f.createIndex('byProject', 'projectId')
        const c = db.createObjectStore('checkpoints', { keyPath: 'id' })
        c.createIndex('byProject', 'projectId')
        db.createObjectStore('checkpointData')
        db.createObjectStore('kv')
      },
    })
  }

  async listProjects() { return (await this.dbp).getAll('projects') as Promise<ProjectMeta[]> }
  async getProject(id: string) { return (await (await this.dbp).get('projects', id)) as ProjectMeta | undefined }
  async putProject(meta: ProjectMeta) { await (await this.dbp).put('projects', meta) }

  async deleteProject(id: string) {
    const db = await this.dbp
    const tx = db.transaction(['projects', 'files', 'checkpoints', 'checkpointData'], 'readwrite')
    await tx.objectStore('projects').delete(id)
    const fileKeys = await tx.objectStore('files').index('byProject').getAllKeys(id)
    for (const k of fileKeys) await tx.objectStore('files').delete(k)
    const cpKeys = await tx.objectStore('checkpoints').index('byProject').getAllKeys(id)
    for (const k of cpKeys) {
      await tx.objectStore('checkpoints').delete(k)
      await tx.objectStore('checkpointData').delete(k)
    }
    await tx.done
  }

  async listFiles(projectId: string) { return (await (await this.dbp).getAllFromIndex('files', 'byProject', projectId)) as FileRecord[] }

  async putFiles(records: FileRecord[]) {
    if (!records.length) return
    const tx = (await this.dbp).transaction('files', 'readwrite')
    for (const r of records) tx.store.put(r)
    await tx.done
  }

  async deleteFiles(projectId: string, paths: string[]) {
    if (!paths.length) return
    const tx = (await this.dbp).transaction('files', 'readwrite')
    for (const p of paths) tx.store.delete([projectId, p])
    await tx.done
  }

  async listCheckpoints(projectId: string) {
    const all = (await (await this.dbp).getAllFromIndex('checkpoints', 'byProject', projectId)) as CheckpointMeta[]
    return all.sort((a, b) => a.seq - b.seq)
  }

  async putCheckpoint(meta: CheckpointMeta, payload: CheckpointPayload) {
    const tx = (await this.dbp).transaction(['checkpoints', 'checkpointData'], 'readwrite')
    tx.objectStore('checkpoints').put(meta)
    tx.objectStore('checkpointData').put(payload, meta.id)
    await tx.done
  }

  async getCheckpointPayload(id: string) { return (await (await this.dbp).get('checkpointData', id)) as CheckpointPayload | undefined }

  async deleteCheckpoint(id: string) {
    const tx = (await this.dbp).transaction(['checkpoints', 'checkpointData'], 'readwrite')
    tx.objectStore('checkpoints').delete(id)
    tx.objectStore('checkpointData').delete(id)
    await tx.done
  }

  async kvGet<T>(key: string) { return (await (await this.dbp).get('kv', key)) as T | undefined }
  async kvSet(key: string, value: unknown) { await (await this.dbp).put('kv', value, key) }
  async kvDelete(key: string) { await (await this.dbp).delete('kv', key) }
  async kvList(prefix: string) {
    const db = await this.dbp
    const keys = (await db.getAllKeys('kv')).filter((k): k is string => typeof k === 'string' && k.startsWith(prefix))
    const out: Array<[string, unknown]> = []
    for (const k of keys) out.push([k, await db.get('kv', k)])
    return out
  }

  async stats(): Promise<StorageStats> {
    const db = await this.dbp
    let bytes = 0
    let files = 0
    let cursor = await db.transaction('files').store.openCursor()
    while (cursor) {
      files++
      bytes += (cursor.value as FileRecord).content.length
      cursor = await cursor.continue()
    }
    let c2 = await db.transaction('checkpointData').store.openCursor()
    while (c2) {
      const v = c2.value as CheckpointPayload
      bytes += typeof v.data === 'string' ? v.data.length : v.data.byteLength
      c2 = await c2.continue()
    }
    return { projects: await db.count('projects'), files, checkpoints: await db.count('checkpoints'), kvEntries: await db.count('kv'), bytes }
  }

  async clearAll() {
    const db = await this.dbp
    for (const s of ['projects', 'files', 'checkpoints', 'checkpointData', 'kv']) await db.clear(s)
  }
}

let singleton: IStorageAdapter | null = null
/** Returns the app-wide storage adapter (IndexedDB when available, in-memory otherwise). */
export function getAdapter(): IStorageAdapter {
  if (!singleton) singleton = typeof indexedDB !== 'undefined' ? new IdbAdapter() : new MemoryAdapter()
  return singleton
}
export function setAdapter(a: IStorageAdapter) { singleton = a }
