import { create } from 'zustand'
import { getAdapter } from '@/core/vfs/idbAdapter'
import { createProject, deleteProject, duplicateProject, updateProject, type CreateProjectInput } from '@/core/vfs/projects'
import type { ProjectMeta } from '@/core/vfs/types'

interface ProjectsState {
  projects: ProjectMeta[]
  loaded: boolean
  refresh: () => Promise<void>
  create: (input: CreateProjectInput) => Promise<ProjectMeta>
  duplicate: (id: string) => Promise<ProjectMeta>
  remove: (id: string) => Promise<void>
  update: (id: string, patch: Partial<ProjectMeta>) => Promise<void>
}

export const useProjects = create<ProjectsState>((set, get) => ({
  projects: [],
  loaded: false,
  refresh: async () => {
    const list = await getAdapter().listProjects()
    list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
    set({ projects: list, loaded: true })
  },
  create: async (input) => {
    const p = await createProject(getAdapter(), input)
    await get().refresh()
    return p
  },
  duplicate: async (id) => {
    const p = await duplicateProject(getAdapter(), id)
    await get().refresh()
    return p
  },
  remove: async (id) => {
    await deleteProject(getAdapter(), id)
    await getAdapter().kvDelete(`chat:${id}`)
    await get().refresh()
  },
  update: async (id, patch) => {
    await updateProject(getAdapter(), id, patch)
    await get().refresh()
  },
}))
