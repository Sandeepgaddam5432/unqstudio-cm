import { uid } from '@/lib/util'
import type { IStorageAdapter, ProjectMeta, Snapshot } from './types'
import { VirtualFileSystem, normalizePath } from './vfs'
import { isBinaryPath } from './vfs'

export interface CreateProjectInput {
  name: string
  files: Record<string, string> | Snapshot
  templateId?: string
  description?: string
  locks?: string[]
  forkOf?: ProjectMeta['forkOf']
  sourceRepo?: string
  checkpointLabel?: string
}

function toRecords(projectId: string, files: CreateProjectInput['files']) {
  const now = Date.now()
  return Object.entries(files).map(([path, v]) => {
    const p = normalizePath(path)
    const isSnap = typeof v === 'object'
    return {
      projectId, path: p, updatedAt: now,
      content: isSnap ? v.c : v,
      encoding: isSnap ? v.e : isBinaryPath(p) ? ('base64' as const) : ('utf8' as const),
    }
  })
}

export async function createProject(adapter: IStorageAdapter, input: CreateProjectInput): Promise<ProjectMeta> {
  const now = Date.now()
  const meta: ProjectMeta = {
    id: uid('p_'), name: input.name.trim() || 'Untitled project', createdAt: now, updatedAt: now, pinned: false,
    templateId: input.templateId, description: input.description, locks: input.locks ?? [], historyPtr: -1,
    forkOf: input.forkOf, sourceRepo: input.sourceRepo,
  }
  await adapter.putProject(meta)
  await adapter.putFiles(toRecords(meta.id, input.files))
  const vfs = await VirtualFileSystem.open(adapter, meta.id)
  await vfs.checkpoint(input.checkpointLabel ?? 'Initial state', 'auto')
  return vfs.meta
}

export async function updateProject(adapter: IStorageAdapter, id: string, patch: Partial<ProjectMeta>) {
  const cur = await adapter.getProject(id)
  if (!cur) throw new Error('Project not found')
  const next = { ...cur, ...patch, id: cur.id, updatedAt: patch.updatedAt ?? Date.now() }
  await adapter.putProject(next)
  return next
}

export async function duplicateProject(adapter: IStorageAdapter, id: string): Promise<ProjectMeta> {
  const src = await VirtualFileSystem.open(adapter, id)
  return createProject(adapter, {
    name: `${src.meta.name} copy`, files: src.snapshot(), templateId: src.meta.templateId, locks: src.getLocks(),
    description: src.meta.description, checkpointLabel: `Duplicated from ${src.meta.name}`,
  })
}

/** Create a brand new project from a past checkpoint of `vfs`. */
export async function forkFromCheckpoint(adapter: IStorageAdapter, vfs: VirtualFileSystem, checkpointId: string, name?: string): Promise<ProjectMeta> {
  const snap = await vfs.getCheckpointSnapshot(checkpointId)
  const cp = vfs.listCheckpoints().find((c) => c.id === checkpointId)
  return createProject(adapter, {
    name: name ?? `${vfs.meta.name} (fork)`, files: snap, templateId: vfs.meta.templateId, locks: vfs.getLocks(),
    forkOf: { projectId: vfs.projectId, checkpointId }, checkpointLabel: `Forked from "${cp?.label ?? 'checkpoint'}"`,
  })
}

export function deleteProject(adapter: IStorageAdapter, id: string) {
  return adapter.deleteProject(id)
}
