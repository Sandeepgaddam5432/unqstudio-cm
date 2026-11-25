import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { getAdapter } from '@/core/vfs/idbAdapter'
import { VirtualFileSystem } from '@/core/vfs/vfs'

export interface DiffTarget { path: string; before: string; after: string; label: string; existed?: boolean }
export interface Reveal { path: string; line: number; col: number; nonce: number }

interface WorkspaceState {
  diffTarget: DiffTarget | null
  reveal: Reveal | null
  revealAt: (path: string, line: number, col?: number) => void
  showDiff: (t: DiffTarget | null) => void
  vfs: VirtualFileSystem | null
  loading: boolean
  error: string | null
  openTabs: string[]
  activeFile: string | null
  /** Files pinned into the AI context (@file / @folder mentions). */
  pinned: string[]
  open: (projectId: string) => Promise<void>
  close: () => void
  openFile: (path: string) => void
  closeFile: (path: string) => void
  setActiveFile: (path: string | null) => void
  togglePin: (path: string) => void
  renameProject: (name: string) => Promise<void>
}

const noop = () => () => {}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  diffTarget: null,
  reveal: null,
  revealAt: (path, line, col = 1) => set((s) => ({ reveal: { path, line, col, nonce: (s.reveal?.nonce ?? 0) + 1 }, openTabs: s.openTabs.includes(path) ? s.openTabs : [...s.openTabs, path], activeFile: path, diffTarget: null })),
  showDiff: (diffTarget) => set({ diffTarget }),
  vfs: null,
  loading: false,
  error: null,
  openTabs: [],
  activeFile: null,
  pinned: [],
  open: async (projectId) => {
    if (get().vfs?.projectId === projectId) return
    set({ loading: true, error: null, vfs: null, openTabs: [], activeFile: null, pinned: [], diffTarget: null })
    try {
      const vfs = await VirtualFileSystem.open(getAdapter(), projectId)
      const paths = vfs.paths()
      const first = ['/src/App.tsx', '/src/App.jsx', '/src/main.tsx', '/index.html'].find((p) => paths.includes(p)) ?? paths[0] ?? null
      set({ vfs, loading: false, openTabs: first ? [first] : [], activeFile: first })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },
  close: () => set({ vfs: null, openTabs: [], activeFile: null, pinned: [], error: null }),
  openFile: (path) => set((s) => ({ openTabs: s.openTabs.includes(path) ? s.openTabs : [...s.openTabs, path], activeFile: path })),
  closeFile: (path) =>
    set((s) => {
      const tabs = s.openTabs.filter((t) => t !== path)
      const idx = s.openTabs.indexOf(path)
      return { openTabs: tabs, activeFile: s.activeFile === path ? (tabs[Math.min(idx, tabs.length - 1)] ?? null) : s.activeFile }
    }),
  setActiveFile: (activeFile) => set({ activeFile }),
  togglePin: (path) => set((s) => ({ pinned: s.pinned.includes(path) ? s.pinned.filter((p) => p !== path) : [...s.pinned, path] })),
  renameProject: async (name) => {
    const vfs = get().vfs
    if (!vfs || !name.trim()) return
    await vfs.setName(name)
  },
}))

/** Re-renders the component whenever the VFS (files, locks, checkpoints) changes. */
export function useVfsVersion(vfs: VirtualFileSystem | null): number {
  return useSyncExternalStore(vfs ? vfs.subscribe : noop, vfs ? vfs.getVersion : () => 0)
}
