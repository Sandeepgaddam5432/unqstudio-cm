import { Bot, Cpu, Eye, MousePointer2, Palette, Search, Terminal } from 'lucide-react'
import { registerCommandProvider, type Command } from './CommandPalette'
import { useSettings, type AIMode } from '@/store/settings'
import { allProviders } from '@/store/aiConfig'
import { useApp } from '@/store/app'
import { useWorkspace } from '@/store/workspace'
import { usePreview } from '@/store/preview'
import { DEFAULT_THEME } from '@/core/vfs/scaffold'
import { contrastText } from '@/core/runtime/theme'
import { applyThemeToProject } from './theme/applyTheme'
import { toast } from '@/store/toast'

registerCommandProvider((): Command[] => {
  const s = useSettings.getState()
  const out: Command[] = []
  for (const m of ['build', 'plan', 'ask'] as AIMode[]) out.push({ id: `aimode:${m}`, group: 'AI mode', label: `AI mode: ${m[0].toUpperCase() + m.slice(1)}`, icon: <Bot size={14} />, run: () => s.set({ aiMode: m }) })
  for (const p of allProviders()) {
    if (s.enabled[p.id] === false) continue
    for (const id of [...p.models.map((m) => m.id), ...(s.userModels[p.id] ?? [])]) out.push({ id: `model:${p.id}:${id}`, group: 'Model', label: `Model: ${p.name} · ${id}`, keywords: `${p.id} ${id}`, icon: <Cpu size={14} />, run: () => { s.set({ activeProvider: p.id, activeModel: id }); toast.success('Model selected', id) } })
  }
  out.push({ id: 'providers', group: 'Actions', label: 'Manage providers & API keys', icon: <Cpu size={14} />, run: () => useApp.getState().openSettings('providers') })
  out.push({ id: 'wizard', group: 'Actions', label: 'Connect a model (setup wizard)', icon: <Cpu size={14} />, run: () => useApp.getState().setOnboardingOpen(true) })
  const vfs = useWorkspace.getState().vfs
  if (vfs) {
    out.push({ id: 'inspect', group: 'Actions', label: 'Toggle element inspector', icon: <MousePointer2 size={14} />, run: () => usePreview.getState().set({ inspectMode: !usePreview.getState().inspectMode, selected: null }) })
    out.push({ id: 'console', group: 'Actions', label: 'Toggle preview console', icon: <Terminal size={14} />, run: () => usePreview.getState().set({ consoleOpen: !usePreview.getState().consoleOpen }) })
    out.push({ id: 'reload', group: 'Actions', label: 'Reload preview', icon: <Eye size={14} />, run: () => usePreview.getState().reload() })
    out.push({ id: 'search', group: 'Actions', label: 'Search in files', icon: <Search size={14} />, run: () => useApp.getState().setMode('code') })
    for (const t of s.plugins.themes) out.push({ id: `ptheme:${t.id}`, group: 'Theme', label: `Project theme: ${t.name}`, icon: <Palette size={14} />, run: async () => { await applyThemeToProject(vfs, { ...DEFAULT_THEME, accent: t.accent, accentFg: contrastText(t.accent), bg: t.bg, surface: t.surface, fg: t.fg, radius: t.radius, font: t.font }); toast.success('Theme applied', t.name) } })
  }
  return out
})
