import { Suspense, lazy, useEffect, useState } from 'react'
import { applyThemeClass, parseRoute, systemTheme, useApp } from '@/store/app'
import { Toaster } from '@/ui/primitives'
import CommandPalette from '@/ui/CommandPalette'
import { Logo } from '@/ui/primitives'
import { useVault } from '@/store/vault'
import { OnboardingWizard } from '@/ui/ai/OnboardingWizard'
import { VaultUnlock } from '@/ui/ai/VaultUnlock'
import '@/ui/commandsExtra'
import { logEvent } from '@/store/events'
import { useModels } from '@/store/models'

const Home = lazy(() => import('@/ui/home/Home'))
const Workspace = lazy(() => import('@/ui/workspace/Workspace'))
const SettingsDrawer = lazy(() => import('@/ui/SettingsDrawer'))

function Splash() {
  return <div className="flex h-full items-center justify-center"><div className="animate-pulse-soft"><Logo size={28} /></div></div>
}

export default function App() {
  const { theme, resolvedTheme, setResolvedTheme, settingsOpen, toggleMode, setPaletteOpen } = useApp()
  const [route, setRoute] = useState(() => parseRoute(location.hash))

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

  useEffect(() => { void useModels.getState().loadRegistry() }, [])
  useEffect(() => { void useVault.getState().init(); logEvent('system', 'UnQStudio started') }, [])
  useEffect(() => { applyThemeClass(theme === 'system' ? systemTheme() : theme, false) }, [])
  useEffect(() => { applyThemeClass(resolvedTheme) }, [resolvedTheme])

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
    <div className="h-full">
      <Suspense fallback={<Splash />}>
        {route.projectId ? <Workspace key={route.projectId} projectId={route.projectId} /> : <Home />}
        {settingsOpen && <SettingsDrawer />}
      </Suspense>
      <CommandPalette />
      <OnboardingWizard />
      <VaultUnlock />
      <Toaster />
    </div>
  )
}
