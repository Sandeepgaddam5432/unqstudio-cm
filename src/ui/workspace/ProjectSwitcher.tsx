import { useEffect, useState } from 'react'
import { Bookmark, Command, FolderOpen, Home, Moon, Pencil, Plus, Redo2, Settings, SlidersHorizontal, Sun, Undo2 } from 'lucide-react'
import { Modal } from '@/ui/primitives'
import { navigateHome, navigateToProject, useApp } from '@/store/app'
import { useProjects } from '@/store/projects'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { toast } from '@/store/toast'
import { haptic } from '@/lib/haptics'
import { timeAgo } from '@/lib/util'
import { cn } from '@/lib/cn'

/** Tappable "Project Pill" sheet: quick project actions (rename, undo/redo/checkpoint, theme, palette, settings) plus a project switcher. */
export function ProjectSwitcher() {
  const { switcherOpen, setSwitcherOpen, resolvedTheme, toggleTheme, openSettings, setPaletteOpen, openProjectSettings } = useApp()
  const vfs = useWorkspace((s) => s.vfs)
  const rename = useWorkspace((s) => s.renameProject)
  useVfsVersion(vfs)
  const projects = useProjects()
  const [name, setName] = useState('')
  useEffect(() => { if (switcherOpen) { setName(vfs?.meta.name ?? ''); void projects.refresh() } }, [switcherOpen])
  const close = () => setSwitcherOpen(false)
  const act = (fn: () => void | Promise<void>) => () => { haptic('tap'); close(); void fn() }
  const commit = async () => { if (name.trim() && name.trim() !== vfs?.meta.name) { await rename(name); toast.success('Project renamed') } }

  const actions = [
    { id: 'undo', label: 'Undo', icon: <Undo2 size={18} />, disabled: !vfs?.canUndo(), run: async () => toast.info((await vfs?.undo()) ? 'Restored previous checkpoint' : 'Nothing to undo') },
    { id: 'redo', label: 'Redo', icon: <Redo2 size={18} />, disabled: !vfs?.canRedo(), run: async () => toast.info((await vfs?.redo()) ? 'Re-applied next checkpoint' : 'Nothing to redo') },
    { id: 'checkpoint', label: 'Checkpoint', icon: <Bookmark size={18} />, run: async () => { const cp = await vfs?.checkpoint(`Manual checkpoint ${new Date().toLocaleTimeString()}`, 'manual'); if (cp) toast.success('Checkpoint saved', cp.label) } },
    { id: 'palette', label: 'Commands', icon: <Command size={18} />, run: () => setPaletteOpen(true) },
    { id: 'theme', label: resolvedTheme === 'dark' ? 'Light' : 'Dark', icon: resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />, run: toggleTheme },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} />, run: () => openSettings() },
  ]
  return (
    <Modal open={switcherOpen} onClose={close} title="Project" size="md">
      <div data-project-switcher className="space-y-5">
        <div className="flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} aria-label="Project name" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-subtle px-3 text-[15px] font-medium outline-none focus:border-accent/60" />
          <span className="text-faint"><Pencil size={14} /></span>
        </div>
        <button onClick={act(() => openProjectSettings())} className="press flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-4 text-left text-sm font-medium"><SlidersHorizontal size={17} className="text-accent" />Project settings, knowledge &amp; versions</button>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Quick actions">
          {actions.map((a) => (
            <button key={a.id} disabled={a.disabled} onClick={act(a.run)} className={cn('press flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-subtle text-[11px] font-medium disabled:opacity-40')}><span className="text-muted">{a.icon}</span>{a.label}</button>
          ))}
        </div>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint"><FolderOpen size={11} />Switch project</p>
          <div className="space-y-1">
            {projects.projects.filter((p) => p.id !== vfs?.meta.id).slice(0, 6).map((p) => (
              <button key={p.id} onClick={act(() => navigateToProject(p.id))} className="press flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm hover:bg-subtle"><span className="truncate font-medium">{p.name}</span><span className="shrink-0 text-xs text-faint">{timeAgo(p.updatedAt)}</span></button>
            ))}
            <button onClick={act(navigateHome)} className="press flex min-h-[48px] w-full items-center gap-2 rounded-xl px-3 text-sm text-muted hover:bg-subtle"><Home size={15} />All projects<Plus size={13} className="ml-auto" /></button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
