import { useRef, useState } from 'react'
import { LayoutTemplate, Moon, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, Star, Sun } from 'lucide-react'
import { Logo } from '@/ui/primitives'
import { AccountPill } from '@/ui/auth/AccountPill'
import { navigateHome, navigateToProject, useApp } from '@/store/app'
import { useProjects } from '@/store/projects'
import { useIsMobile } from '@/lib/useMedia'
import { recentProjects, starredProjects } from '@/lib/projectFilters'
import { swipeIntent } from '@/ui/primitives/sheetPhysics'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import type { ProjectMeta } from '@/core/vfs/types'

function goShowcase() {
  navigateHome()
  setTimeout(() => document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
}

function Row({ p, active, onPick }: { p: ProjectMeta; active: boolean; onPick: () => void }) {
  return (
    <li>
      <button onClick={onPick} data-sidebar-project={p.id} aria-current={active ? 'page' : undefined} className={cn('press flex min-h-[40px] w-full items-center gap-2 rounded-xl px-2.5 text-left text-[13px]', active ? 'bg-accent/12 font-semibold text-fg' : 'text-muted hover:bg-subtle hover:text-fg')}>
        {p.starred && <Star size={11} className="shrink-0 fill-accent text-accent" />}
        <span className="min-w-0 flex-1 truncate">{p.name}</span>
      </button>
    </li>
  )
}

function Content({ collapsed, close }: { collapsed: boolean; close?: () => void }) {
  const { projectId, resolvedTheme, toggleTheme, openSettings, setPendingPrompt } = useApp()
  const projects = useProjects((s) => s.projects)
  const [q, setQ] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const done = (fn: () => void) => () => { haptic('tap'); fn(); close?.() }
  const starred = starredProjects(projects, q)
  const recent = recentProjects(projects, q, 8)
  const iconBtn = 'press flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-subtle hover:text-fg'

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-1 py-3" data-sidebar-rail>
        <Logo size={24} className="mb-2" />
        <button className={iconBtn} aria-label="New project" onClick={done(() => { setPendingPrompt(null); navigateHome(); setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus(), 150) })}><Plus size={18} /></button>
        <button className={iconBtn} aria-label="Templates and showcase" onClick={done(goShowcase)}><LayoutTemplate size={17} /></button>
        <div className="flex-1" />
        <button className={iconBtn} aria-label="Toggle theme" onClick={toggleTheme}>{resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
        <button className={iconBtn} aria-label="Settings" onClick={() => openSettings()}><Settings size={17} /></button>
      </div>
    )
  }
  const section = (label: string) => <p className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-faint">{label}</p>
  return (
    <div className="flex h-full min-h-0 flex-col" data-sidebar-content>
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-4" style={{ paddingTop: 'calc(var(--sat, 0px) + 16px)' }}>
        <Logo size={26} /><span className="text-[16px] font-semibold tracking-tight">UnQStudio</span>
      </div>
      <div className="space-y-2 px-3 pt-1">
        <button onClick={done(() => { navigateHome(); setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.focus(), 150) })} className="press flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 text-[14px] font-semibold text-accent-fg"><Plus size={16} />New Project</button>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" aria-label="Search projects in sidebar" className="h-10 w-full rounded-xl border border-line bg-subtle pl-8 pr-2 text-[13px] outline-none focus:border-accent/60" />
        </div>
      </div>
      <nav aria-label="Projects" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
        {starred.length > 0 && <>{section('Starred')}<ul className="space-y-0.5" data-sidebar-starred>{starred.map((p) => <Row key={p.id} p={p} active={p.id === projectId} onPick={done(() => navigateToProject(p.id))} />)}</ul></>}
        {section('Recent')}
        <ul className="space-y-0.5" data-sidebar-recent>
          {recent.map((p) => <Row key={p.id} p={p} active={p.id === projectId} onPick={done(() => navigateToProject(p.id))} />)}
          {recent.length === 0 && <li className="px-2.5 py-2 text-xs text-faint">{q ? 'No matches.' : 'No projects yet.'}</li>}
        </ul>
        {section('Explore')}
        <button onClick={done(goShowcase)} className="press flex min-h-[40px] w-full items-center gap-2 rounded-xl px-2.5 text-left text-[13px] text-muted hover:bg-subtle hover:text-fg"><LayoutTemplate size={15} />Templates &amp; Showcase</button>
      </nav>
      <div className="space-y-1 border-t border-line p-3" style={{ paddingBottom: 'max(var(--sab, 0px), 12px)' }}>
        <div className="flex items-center justify-between gap-2 px-1"><AccountPill /><span className="text-[10px] text-faint">Cloud sync</span></div>
        <button onClick={toggleTheme} aria-label="Toggle theme" className="press flex min-h-[40px] w-full items-center gap-2 rounded-xl px-2.5 text-left text-[13px] text-muted hover:bg-subtle hover:text-fg">{resolvedTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}{resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}</button>
        <button onClick={done(() => openSettings())} aria-label="Settings" className="press flex min-h-[40px] w-full items-center gap-2 rounded-xl px-2.5 text-left text-[13px] text-muted hover:bg-subtle hover:text-fg"><Settings size={15} />Global Settings</button>
      </div>
    </div>
  )
}

/** Collapsible left navigation: persisted rail on desktop, swipe-dismissable slide-over drawer on phones. */
export function AppSidebar() {
  const mobile = useIsMobile()
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleSidebarCollapsed } = useApp()
  const start = useRef<{ x: number; y: number } | null>(null)
  const swipe = (e: React.PointerEvent, want: 'open' | 'close') => {
    if (!start.current) return
    const r = swipeIntent(e.clientX - start.current.x, e.clientY - start.current.y)
    if (r === want) { start.current = null; setSidebarOpen(want === 'open'); haptic('tap') }
  }

  if (mobile) {
    return (
      <>
        {!sidebarOpen && <div data-sidebar-edge className="fixed inset-y-0 left-0 z-[55] w-3" style={{ touchAction: 'pan-y' }} onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY } }} onPointerMove={(e) => swipe(e, 'open')} onPointerUp={() => { start.current = null }} />}
        {sidebarOpen && (
          <div className="fixed inset-0 z-[80]" data-sidebar-drawer role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} data-sidebar-backdrop />
            <aside onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY } }} onPointerMove={(e) => swipe(e, 'close')} onPointerUp={() => { start.current = null }} style={{ touchAction: 'pan-y' }} className="animate-slide-left absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col border-r border-line bg-panel shadow-pop">
              <Content collapsed={false} close={() => setSidebarOpen(false)} />
            </aside>
          </div>
        )}
      </>
    )
  }
  return (
    <aside data-app-sidebar data-collapsed={sidebarCollapsed} className={cn('relative hidden shrink-0 flex-col border-r border-line bg-panel transition-[width] duration-300 ease-[cubic-bezier(.32,.72,0,1)] md:flex', sidebarCollapsed ? 'w-14' : 'w-64')}>
      <Content collapsed={sidebarCollapsed} />
      <button onClick={toggleSidebarCollapsed} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="press absolute -right-3 top-5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-panel text-muted shadow-sm hover:text-fg">{sidebarCollapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}</button>
    </aside>
  )
}
