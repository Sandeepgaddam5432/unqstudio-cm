import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Bookmark, Code2, File, Home, LayoutTemplate, Moon, Palette, Redo2, Rocket, Search, Settings, Sparkles, Sun, Undo2 } from 'lucide-react'
import { fuzzyScore } from '@/lib/fuzzy'
import { navigateHome, navigateToProject, useApp } from '@/store/app'
import { useWorkspace } from '@/store/workspace'
import { useProjects } from '@/store/projects'
import { getAllTemplates } from '@/templates'
import { toast } from '@/store/toast'
import { cn } from '@/lib/cn'
import { Kbd } from '@/ui/primitives'

export interface Command { id: string; group: string; label: string; hint?: string; icon?: ReactNode; keywords?: string; run: () => void | Promise<void> }

export function buildCommands(): Command[] {
  const app = useApp.getState()
  const ws = useWorkspace.getState()
  const cmds: Command[] = []
  const inWs = !!ws.vfs
  cmds.push({ id: 'home', group: 'Navigate', label: 'Go to all projects', icon: <Home size={14} />, run: navigateHome })
  cmds.push({ id: 'settings', group: 'Actions', label: 'Open settings', icon: <Settings size={14} />, run: () => app.openSettings() })
  cmds.push({ id: 'theme', group: 'Theme', label: 'Toggle light / dark theme', icon: app.resolvedTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />, run: () => app.toggleTheme() })
  cmds.push({ id: 'theme-dark', group: 'Theme', label: 'Theme: Obsidian Dark', icon: <Palette size={14} />, run: () => app.setTheme('dark') })
  cmds.push({ id: 'theme-light', group: 'Theme', label: 'Theme: Paper Light', icon: <Palette size={14} />, run: () => app.setTheme('light') })
  cmds.push({ id: 'theme-system', group: 'Theme', label: 'Theme: Follow system', icon: <Palette size={14} />, run: () => app.setTheme('system') })
  if (inWs && ws.vfs) {
    const vfs = ws.vfs
    cmds.push({ id: 'mode', group: 'Actions', label: app.mode === 'studio' ? 'Switch to Code Mode' : 'Switch to Studio Mode', hint: '⌘E', icon: app.mode === 'studio' ? <Code2 size={14} /> : <Sparkles size={14} />, run: () => app.toggleMode() })
    cmds.push({ id: 'undo', group: 'Actions', label: 'Undo (previous checkpoint)', icon: <Undo2 size={14} />, run: async () => { toast.info((await vfs.undo()) ? 'Restored previous checkpoint' : 'Nothing to undo') } })
    cmds.push({ id: 'redo', group: 'Actions', label: 'Redo (next checkpoint)', icon: <Redo2 size={14} />, run: async () => { toast.info((await vfs.redo()) ? 'Re-applied next checkpoint' : 'Nothing to redo') } })
    cmds.push({ id: 'checkpoint', group: 'Actions', label: 'Save checkpoint', icon: <Bookmark size={14} />, run: async () => { await vfs.checkpoint(`Manual checkpoint ${new Date().toLocaleTimeString()}`, 'manual'); toast.success('Checkpoint saved') } })
    cmds.push({ id: 'publish', group: 'Actions', label: 'Publish / Export…', icon: <Rocket size={14} />, run: () => app.setPublishOpen(true) })
    for (const p of vfs.paths()) if (!p.endsWith('/.keep')) cmds.push({ id: `file:${p}`, group: 'Files', label: p.slice(1), icon: <File size={14} />, run: () => { ws.openFile(p); app.setMode('code') } })
  }
  for (const t of getAllTemplates()) {
    cmds.push({ id: `tpl:${t.id}`, group: 'New project', label: `New project from “${t.name}”`, keywords: t.tags.join(' '), icon: <LayoutTemplate size={14} />, run: async () => { const p = await useProjects.getState().create({ name: t.name, files: t.files, templateId: t.id }); navigateToProject(p.id) } })
  }
  for (const extra of extraCommandProviders) cmds.push(...extra())
  return cmds
}

/** Other modules register command sources (AI modes, models, search…) here. */
const extraCommandProviders: Array<() => Command[]> = []
export function registerCommandProvider(fn: () => Command[]) { extraCommandProviders.push(fn) }

export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useApp()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const all = useMemo(() => (paletteOpen ? buildCommands() : []), [paletteOpen])

  const results = useMemo(() => {
    if (!q.trim()) return all.filter((c) => c.group !== 'Files' && c.group !== 'New project').slice(0, 60)
    return all
      .map((c) => ({ c, s: fuzzyScore(q, `${c.label} ${c.keywords ?? ''}`) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map((x) => x.c)
  }, [q, all])

  useEffect(() => { setSel(0) }, [q, paletteOpen])
  useEffect(() => { if (!paletteOpen) setQ('') }, [paletteOpen])
  useEffect(() => { list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }) }, [sel])

  if (!paletteOpen) return null
  const run = (c?: Command) => { if (!c) return; setPaletteOpen(false); void c.run() }
  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-start justify-center px-3 pt-[12vh]">
      <div className="animate-fade absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setPaletteOpen(false)} />
      <div role="dialog" aria-label="Command palette" className="animate-pop relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-panel shadow-pop">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={15} className="text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
              else if (e.key === 'Enter') { e.preventDefault(); run(results[sel]) }
              else if (e.key === 'Escape') setPaletteOpen(false)
            }}
            placeholder="Search files, actions, models, templates, themes…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <Kbd>esc</Kbd>
        </div>
        <div ref={list} className="max-h-[50vh] overflow-auto p-1.5">
          {results.length === 0 && <p className="p-6 text-center text-sm text-muted">No matches</p>}
          {results.map((c, i) => (
            <button
              key={c.id}
              data-i={i}
              onMouseMove={() => setSel(i)}
              onClick={() => run(c)}
              className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px]', i === sel ? 'bg-subtle' : '')}
            >
              <span className="text-muted">{c.icon}</span>
              <span className="flex-1 truncate">{c.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-faint">{c.group}</span>
              {c.hint && <Kbd>{c.hint}</Kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
