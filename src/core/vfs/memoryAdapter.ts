import type { CheckpointMeta, CheckpointPayload, FileRecord, IStorageAdapter, ProjectMeta, StorageStats } from './types'

const clone = <T>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)))

export class MemoryAdapter implements IStorageAdapter {
  readonly kind = 'memory'
  private projects = new Map<string, ProjectMeta>()
  private files = new Map<string, Map<string, FileRecord>>()
  private cps = new Map<string, CheckpointMeta>()
  private cpData = new Map<string, CheckpointPayload>()
  private kv = new Map<string, unknown>()

  async listProjects() { return [...this.projects.values()].map(clone) }
  async getProject(id: string) { const p = this.projects.get(id); return p ? clone(p) : undefined }
  async putProject(meta: ProjectMeta) { this.projects.set(meta.id, clone(meta)) }
  async deleteProject(id: string) {
    this.projects.delete(id)
    this.files.delete(id)
    for (const [cid, c] of this.cps) if (c.projectId === id) { this.cps.delete(cid); this.cpData.delete(cid) }
  }
  async listFiles(projectId: string) { return [...(this.files.get(projectId)?.values() ?? [])].map(clone) }
  async putFiles(records: FileRecord[]) {
    for (const r of records) {
      let m = this.files.get(r.projectId)
      if (!m) this.files.set(r.projectId, (m = new Map()))
      m.set(r.path, clone(r))
    }
  }
  async deleteFiles(projectId: string, paths: string[]) { for (const p of paths) this.files.get(projectId)?.delete(p) }
  async listCheckpoints(projectId: string) {
    return [...this.cps.values()].filter((c) => c.projectId === projectId).sort((a, b) => a.seq - b.seq).map(clone)
  }
  async putCheckpoint(meta: CheckpointMeta, payload: CheckpointPayload) {
    this.cps.set(meta.id, clone(meta))
    this.cpData.set(meta.id, payload)
  }
  async getCheckpointPayload(id: string) { return this.cpData.get(id) }
  async deleteCheckpoint(id: string) { this.cps.delete(id); this.cpData.delete(id) }
  async kvGet<T>(key: string) { return this.kv.has(key) ? (clone(this.kv.get(key)) as T) : undefined }
  async kvSet(key: string, value: unknown) { this.kv.set(key, clone(value)) }
  async kvDelete(key: string) { this.kv.delete(key) }
  async kvList(prefix: string) { return [...this.kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, clone(v)] as [string, unknown]) }
  async stats(): Promise<StorageStats> {
    let files = 0
    let bytes = 0
    for (const m of this.files.values()) for (const f of m.values()) { files++; bytes += f.content.length }
    for (const d of this.cpData.values()) bytes += typeof d.data === 'string' ? d.data.length : d.data.byteLength
    return { projects: this.projects.size, files, checkpoints: this.cps.size, kvEntries: this.kv.size, bytes }
  }
  async clearAll() {
    this.projects.clear(); this.files.clear(); this.cps.clear(); this.cpData.clear(); this.kv.clear()
  }
}
