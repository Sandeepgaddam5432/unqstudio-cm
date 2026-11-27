export type Encoding = 'utf8' | 'base64'

export interface ProjectMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  templateId?: string
  description?: string
  /** Files or folders (absolute VFS paths) that the AI agent may not modify. */
  locks: string[]
  /** Index into the checkpoint timeline of the state the workspace currently equals. */
  historyPtr: number
  forkOf?: { projectId: string; checkpointId: string }
  sourceRepo?: string
  /** v3.0: compact auto-captured preview thumbnail (image data URL, capped by core/preview/thumbnail.ts). */
  thumbnail?: string
  /** v3.0: starred in the sidebar / Home. */
  starred?: boolean
  /** v3.1: archived from the Chats view (hidden from All, shown under Archived). */
  archived?: boolean
  /** v3.0: Project Knowledge — per-project markdown instructions injected into every AI turn. */
  knowledge?: string
  /** v3.0: bookmarked (starred) version checkpoint ids shown in Version History. */
  bookmarks?: string[]
}

export interface FileRecord {
  projectId: string
  path: string
  content: string
  encoding: Encoding
  updatedAt: number
}

export type CheckpointKind = 'auto' | 'manual' | 'ai' | 'restore'

export interface CheckpointMeta {
  id: string
  projectId: string
  label: string
  kind: CheckpointKind
  createdAt: number
  fileCount: number
  bytes: number
  seq: number
  hash: string
}

export interface CheckpointPayload {
  compressed: boolean
  data: Uint8Array | string
}

export interface SnapshotEntry {
  c: string
  e: Encoding
}
export type Snapshot = Record<string, SnapshotEntry>

export interface StorageStats {
  projects: number
  files: number
  checkpoints: number
  kvEntries: number
  bytes: number
}

/** Storage port. IndexedDB is the production adapter; memory is used for tests / private mode fallback. */
export interface IStorageAdapter {
  readonly kind: string
  listProjects(): Promise<ProjectMeta[]>
  getProject(id: string): Promise<ProjectMeta | undefined>
  putProject(meta: ProjectMeta): Promise<void>
  deleteProject(id: string): Promise<void>

  listFiles(projectId: string): Promise<FileRecord[]>
  putFiles(records: FileRecord[]): Promise<void>
  deleteFiles(projectId: string, paths: string[]): Promise<void>

  listCheckpoints(projectId: string): Promise<CheckpointMeta[]>
  putCheckpoint(meta: CheckpointMeta, payload: CheckpointPayload): Promise<void>
  getCheckpointPayload(id: string): Promise<CheckpointPayload | undefined>
  deleteCheckpoint(id: string): Promise<void>

  kvGet<T = unknown>(key: string): Promise<T | undefined>
  kvSet(key: string, value: unknown): Promise<void>
  kvDelete(key: string): Promise<void>
  kvList(prefix: string): Promise<Array<[string, unknown]>>

  stats(): Promise<StorageStats>
  clearAll(): Promise<void>
}

export type FileDiffStatus = 'added' | 'removed' | 'modified'
export interface FileDiff {
  path: string
  status: FileDiffStatus
  before?: string
  after?: string
}
