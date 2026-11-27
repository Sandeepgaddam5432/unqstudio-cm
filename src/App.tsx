import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { applyAccent, applyThemeClass, parseRoute, systemTheme, useApp } from '@/store/app'
import { Toaster } from '@/ui/primitives'
import CommandPalette from '@/ui/CommandPalette'
import { useVault } from '@/store/vault'
import { OnboardingWizard } from '@/ui/ai/OnboardingWizard'
import { CustomProviderModal } from '@/ui/ai/CustomProviderModal'
import { VaultUnlock } from '@/ui/ai/VaultUnlock'
import '@/ui/commandsExtra'
import { logEvent } from '@/store/events'
import { useModels } from '@/store/models'
import { useAuth } from '@/store/auth'
import { AppSidebar } from '@/ui/layout/AppSidebar'
import { useProjects } from '@/store/projects'
import { initTheme } from '@/store/theme'
import { AuthModal } from '@/ui/auth/AuthModal'
import { MobileBottomNav } from '@/ui/layout/MobileBottomNav'
import { WorkspaceSheet } from '@/ui/layout/WorkspaceSwitcher'
import { ViewSkeleton } from '@/ui/primitives/Skeleton'
import { useIsMobile } from '@/lib/useMedia'

const Home = lazy(() => import('@/ui/home/Home'))
const ProjectsView = lazy(() => import('@/ui/home/ProjectsView'))
const ChatsView = lazy(() => import('@/ui/home/ChatsView'))
const Workspace = lazy(() => import('@/ui/workspace/Workspace'))
const SettingsDrawer = lazy(() => import('@/ui/SettingsDrawer'))

export default function App() {
  const { theme, resolvedTheme, setResolvedTheme, settingsOpen, toggleMode, setPaletteOpen } = useApp()
  const [route, setRoute] = useState(() => parseRoute(location.hash))
  const mobile = useIsMobile()
  const [skel, setSkel] = useState(false)
  const first = useRef(true)
  const routeKey = route.projectId ? `p:${route.projectId}` : route.view
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (route.projectId) return
    setSkel(true)
    const t = setTimeout(() => setSkel(false), 280)
    return () => clearTimeout(t)
  }, [routeKey])

  useEffect(() => {
    const h = () => setRoute(parseRoute(location.hash))
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const sync = () => { if (useApp.getState().theme === 'system') setResolvedTheme(systemTheme()) }
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => { void useProjects.getState().refresh() }, [route.projectId])
  useEffect(() => { void useModels.getState().loadRegistry(); void useAuth.getState().init() }, [])
  useEffect(() => { void useVault.getState().init(); logEvent('system', 'UnQStudio started') }, [])
  useEffect(() => { initTheme() }, [])
  useEffect(() => { applyThemeClass(theme === 'system' ? systemTheme() : theme, false) }, [])
  useEffect(() => { applyThemeClass(resolvedTheme) }, [resolvedTheme])
  const accent = useApp((s) => s.accent)
  useEffect(() => { applyAccent(accent) }, [accent])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(!useApp.getState().paletteOpen) }
      else if (mod && e.key.toLowerCase() === 'e' && parseRoute(location.hash).projectId) { e.preventDefault(); toggleMode() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full min-w-0">
      <AppSidebar />
      <div className="h-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto" data-app-main>
      <Suspense fallback={<ViewSkeleton kind={route.projectId ? 'workspace' : route.view} />}>
        {route.projectId ? <Workspace key={route.projectId} projectId={route.projectId} /> : skel ? <ViewSkeleton kind={route.view} /> : route.view === 'projects' ? <ProjectsView /> : route.view === 'chats' ? <ChatsView /> : <Home />}
        {settingsOpen && <SettingsDrawer />}
      </Suspense>
      </div>
      {mobile && !route.projectId && <MobileBottomNav view={route.view} />}
      <WorkspaceSheet />
      <CommandPalette />
      <OnboardingWizard />
      <CustomProviderModal />
      <AuthModal />
      <VaultUnlock />
      <Toaster />
    </div>
  )
}
