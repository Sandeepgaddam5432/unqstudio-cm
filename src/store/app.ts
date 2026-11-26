import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePref = 'system' | 'dark' | 'light'
export type WorkspaceMode = 'studio' | 'code'

export interface PendingPrompt { text: string; images?: string[] }

interface AppState {
  theme: ThemePref
  resolvedTheme: 'dark' | 'light'
  mode: WorkspaceMode
  projectId: string | null
  settingsOpen: boolean
  settingsTab: string
  publishOpen: boolean
  paletteOpen: boolean
  onboardingOpen: boolean
  pendingPrompt: PendingPrompt | null
  setTheme: (t: ThemePref) => void
  toggleTheme: () => void
  setResolvedTheme: (t: 'dark' | 'light') => void
  setMode: (m: WorkspaceMode) => void
  toggleMode: () => void
  setProjectId: (id: string | null) => void
  openSettings: (tab?: string) => void
  closeSettings: () => void
  setPublishOpen: (v: boolean) => void
  setPaletteOpen: (v: boolean) => void
  setOnboardingOpen: (v: boolean) => void
  setPendingPrompt: (p: PendingPrompt | null) => void
}

export const systemTheme = (): 'dark' | 'light' =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: systemTheme(),
      mode: 'studio',
      projectId: null,
      settingsOpen: false,
      settingsTab: 'providers',
      publishOpen: false,
      paletteOpen: false,
      onboardingOpen: false,
      pendingPrompt: null,
      setTheme: (theme) => set({ theme, resolvedTheme: theme === 'system' ? systemTheme() : theme }),
      toggleTheme: () => get().setTheme(get().resolvedTheme === 'dark' ? 'light' : 'dark'),
      setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
      setMode: (mode) => set({ mode }),
      toggleMode: () => set({ mode: get().mode === 'studio' ? 'code' : 'studio' }),
      setProjectId: (projectId) => set({ projectId }),
      openSettings: (tab) => set({ settingsOpen: true, settingsTab: tab ?? get().settingsTab }),
      closeSettings: () => set({ settingsOpen: false }),
      setPublishOpen: (publishOpen) => set({ publishOpen }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setOnboardingOpen: (onboardingOpen) => set({ onboardingOpen }),
      setPendingPrompt: (pendingPrompt) => set({ pendingPrompt }),
    }),
    { name: 'unq.app.v1', partialize: (s) => ({ theme: s.theme, mode: s.mode }) },
  ),
)

export function applyThemeClass(resolved: 'dark' | 'light', animate = true) {
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-transition')
    setTimeout(() => root.classList.remove('theme-transition'), 320)
  }
  root.classList.toggle('dark', resolved === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#09090B' : '#FAFAFA')
}

export function navigateToProject(id: string) { location.hash = `#/p/${id}` }
export function navigateHome() { location.hash = '#/' }
export function parseRoute(hash: string): { projectId: string | null } {
  const m = /^#\/p\/([^/?]+)/.exec(hash)
  return { projectId: m ? decodeURIComponent(m[1]) : null }
}
