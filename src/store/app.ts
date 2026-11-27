import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { markSeen } from '@/lib/chatFilters'

export type ThemePref = 'system' | 'dark' | 'light'
export type WorkspaceMode = 'studio' | 'code'
export type AccentPreset = 'signature' | 'warm'

export type AppView = 'home' | 'projects' | 'chats'
export type SheetId = 'workspace' | 'account' | 'accountSettings' | 'connectors' | 'workspaceSettings' | 'appearance'

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
  accent: AccentPreset
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  switcherOpen: boolean
  projectSettingsOpen: boolean
  projectSettingsTab: string
  publishTab: string | null
  openPublish: (tab?: string) => void
  sheet: SheetId | null
  openSheet: (s: SheetId) => void
  closeSheet: () => void
  pendingPrompt: PendingPrompt | null
  mobilePane: 'chat' | 'preview'
  setMobilePane: (p: 'chat' | 'preview') => void
  requestedTab: { tab: 'chat' | 'preview'; n: number } | null
  requestTab: (t: 'chat' | 'preview') => void
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
  setAccent: (a: AccentPreset) => void
  setSidebarOpen: (v: boolean) => void
  toggleSidebarCollapsed: () => void
  setSwitcherOpen: (v: boolean) => void
  openProjectSettings: (tab?: string) => void
  closeProjectSettings: () => void
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
      accent: 'signature',
      sidebarOpen: false,
      sidebarCollapsed: false,
      switcherOpen: false,
      projectSettingsOpen: false,
      projectSettingsTab: 'overview',
      publishTab: null,
      sheet: null,
      openSheet: (sheet) => set({ sheet }),
      closeSheet: () => set({ sheet: null }),
      openPublish: (tab) => set({ publishOpen: true, publishTab: tab ?? null }),
      pendingPrompt: null,
      mobilePane: 'chat',
      setMobilePane: (mobilePane) => set({ mobilePane }),
      requestedTab: null,
      requestTab: (tab) => set((s) => ({ requestedTab: { tab, n: (s.requestedTab?.n ?? 0) + 1 } })),
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
      setAccent: (accent) => set({ accent }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebarCollapsed: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSwitcherOpen: (switcherOpen) => set({ switcherOpen }),
      openProjectSettings: (tab) => set({ projectSettingsOpen: true, projectSettingsTab: tab ?? 'overview' }),
      closeProjectSettings: () => set({ projectSettingsOpen: false }),
    }),
    { name: 'unq.app.v1', partialize: (s) => ({ theme: s.theme, mode: s.mode, accent: s.accent, sidebarCollapsed: s.sidebarCollapsed }) },
  ),
)

export function applyThemeClass(resolved: 'dark' | 'light', animate = true) {
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-transition')
    setTimeout(() => root.classList.remove('theme-transition'), 320)
  }
  root.classList.toggle('dark', resolved === 'dark')
  syncThemeColorMeta(resolved)
}

/** Keep the browser/PWA status-bar colour in lock-step with the active theme (replaces the media-query variants). */
export function syncThemeColorMeta(resolved: 'dark' | 'light') {
  const color = resolved === 'dark' ? '#09090B' : '#FAFAFA'
  const metas = document.querySelectorAll('meta[name="theme-color"]')
  metas.forEach((m, i) => { if (i === 0) { m.removeAttribute('media'); m.setAttribute('content', color) } else m.remove() })
}

export function applyAccent(a: AccentPreset) {
  if (a === 'warm') document.documentElement.dataset.accent = 'warm'
  else delete document.documentElement.dataset.accent
}

export function navigateToProject(id: string) { markSeen(id); location.hash = `#/p/${id}` }
export function navigateToView(v: AppView) { location.hash = v === 'home' ? '#/' : `#/${v}` }
export function navigateHome() { location.hash = '#/' }
export function parseRoute(hash: string): { projectId: string | null; view: AppView } {
  const m = /^#\/p\/([^/?]+)/.exec(hash)
  const v = /^#\/(projects|chats)(?:[/?]|$)/.exec(hash)
  return { projectId: m ? decodeURIComponent(m[1]) : null, view: v ? (v[1] as AppView) : 'home' }
}
