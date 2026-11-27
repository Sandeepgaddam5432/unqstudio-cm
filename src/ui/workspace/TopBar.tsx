import { useEffect, useRef, useState } from 'react'
import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, Code2, Command, Eye, Moon, PanelLeft, Redo2, Rocket, Settings, SlidersHorizontal, Sun, Undo2, X } from 'lucide-react'
import { Button, Logo, Segmented, Tooltip, Kbd } from '@/ui/primitives'
import { navigateHome, useApp } from '@/store/app'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { toast } from '@/store/toast'
import { AccountPill } from '@/ui/auth/AccountPill'
import { useIsMobile } from '@/lib/useMedia'
import { haptic } from '@/lib/haptics'

/** Zero-clutter phone header: sidebar/home trigger, tappable Project Pill, Publish pill. Everything else lives in the Project sheet. */
function MobileTopBar() {
  const { setSwitcherOpen, requestTab } = useApp()
  const pane = useApp((s) => s.mobilePane)
  const vfs = useWorkspace((s) => s.vfs)
  useVfsVersion(vfs)
  const circle = 'press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/90 shadow-xs-surface hover:shadow-md-surface'
  return (
    <header data-topbar data-topbar-mobile className="flex min-w-0 shrink-0 items-center gap-2 px-3 pb-1.5" style={{ paddingTop: 'calc(var(--sat, 0px) + 6px)' }}>
      <button onClick={() => { haptic('tap'); navigateHome() }} data-close-workspace aria-label="Close project" className={circle}><X size={19} /></button>
      <button onClick={() => { haptic('tap'); setSwitcherOpen(true) }} data-project-pill aria-label="Project menu" className="press flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary/90 px-4 text-[14px] font-medium shadow-xs-surface">
        <span className="truncate">{vfs?.meta.name ?? '…'}</span><ChevronDown size={15} className="shrink-0 text-fg-tertiary" />
      </button>
      <button onClick={() => { haptic('select'); requestTab(pane === 'chat' ? 'preview' : 'chat') }} data-pane-arrow aria-label={pane === 'chat' ? 'Show preview' : 'Show chat'} className={circle}>{pane === 'chat' ? <ChevronRight size={19} /> : <ChevronLeft size={19} />}</button>
    </header>
  )
}

export function TopBar() {
  const mobile = useIsMobile()
  return mobile ? <MobileTopBar /> : <DesktopTopBar />
}

function DesktopTopBar() {
  const { mode, setMode, resolvedTheme, toggleTheme, openSettings, setPublishOpen, setPaletteOpen, setSidebarOpen, toggleSidebarCollapsed, openProjectSettings } = useApp()
  const vfs = useWorkspace((s) => s.vfs)
  const rename = useWorkspace((s) => s.renameProject)
  useVfsVersion(vfs)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) input.current?.select() }, [editing])

  const commit = async () => {
    setEditing(false)
    if (name.trim() && name.trim() !== vfs?.meta.name) await rename(name)
  }
  const undo = async () => { if (vfs) toast.info((await vfs.undo()) ? 'Restored previous checkpoint' : 'Nothing to undo') }
  const redo = async () => { if (vfs) toast.info((await vfs.redo()) ? 'Re-applied next checkpoint' : 'Nothing to redo') }
  const checkpoint = async () => {
    if (!vfs) return
    const cp = await vfs.checkpoint(`Manual checkpoint ${new Date().toLocaleTimeString()}`, 'manual')
    toast.success('Checkpoint saved', cp.label)
  }
  const canUndo = !!vfs?.canUndo()
  const canRedo = !!vfs?.canRedo()
  void setSidebarOpen

  return (
    <header data-topbar className="flex h-12 min-w-0 shrink-0 items-center justify-between gap-2 bg-base px-3">
      <div className="flex min-w-0 flex-none items-center gap-1.5">
        <Tooltip label="Toggle sidebar"><button onClick={toggleSidebarCollapsed} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-subtle" aria-label="Toggle sidebar"><PanelLeft size={16} /></button></Tooltip>
        <Tooltip label="All projects"><button onClick={navigateHome} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-subtle" aria-label="Back to projects"><Logo size={20} /></button></Tooltip>
        <span className="text-faint">/</span>
        {editing ? (
          <input ref={input} value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') void commit(); if (e.key === 'Escape') setEditing(false) }} className="h-7 w-52 rounded-md border border-accent/60 bg-subtle px-2 text-sm font-medium outline-none" aria-label="Project name" />
        ) : (
          <Tooltip label="Rename project">
            <button onClick={() => { setName(vfs?.meta.name ?? ''); setEditing(true) }} className="max-w-[16rem] truncate rounded-md px-2 py-1 text-sm font-medium hover:bg-subtle">{vfs?.meta.name ?? '…'}</button>
          </Tooltip>
        )}
        <Tooltip label="Project settings"><Button variant="ghost" size="icon-sm" onClick={() => openProjectSettings()} aria-label="Project settings"><SlidersHorizontal size={14} /></Button></Tooltip>
      </div>

      <Tooltip label="Switch workspace" hint="⌘E">
        <span className="inline-flex">
          <Segmented value={mode} onChange={setMode} items={[{ id: 'studio', label: <span>Preview</span>, icon: <Eye size={13} /> }, { id: 'code', label: <span>Code</span>, icon: <Code2 size={13} /> }]} />
        </span>
      </Tooltip>

      <div className="flex shrink-0 items-center gap-1">
        <Tooltip label="Undo to previous checkpoint"><Button variant="ghost" size="icon-sm" disabled={!canUndo} onClick={undo} aria-label="Undo"><Undo2 size={15} /></Button></Tooltip>
        <Tooltip label="Redo"><Button variant="ghost" size="icon-sm" disabled={!canRedo} onClick={redo} aria-label="Redo"><Redo2 size={15} /></Button></Tooltip>
        <Tooltip label="Save checkpoint"><Button variant="ghost" size="icon-sm" onClick={checkpoint} aria-label="Save checkpoint"><Bookmark size={15} /></Button></Tooltip>
        <Tooltip label="Command palette" hint="⌘K"><Button variant="ghost" size="sm" onClick={() => setPaletteOpen(true)} aria-label="Command palette"><Command size={14} /><Kbd>K</Kbd></Button></Tooltip>
        <Tooltip label="Toggle theme"><Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Toggle theme">{resolvedTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</Button></Tooltip>
        <AccountPill />
        <Tooltip label="Settings"><Button variant="ghost" size="icon-sm" onClick={() => openSettings()} aria-label="Settings"><Settings size={15} /></Button></Tooltip>
        <button onClick={() => setPublishOpen(true)} data-publish-btn className="press ml-1 flex h-8 items-center gap-1.5 rounded-lg bg-blue-solid px-3 text-[13px] font-medium"><Rocket size={13} /><span>Publish</span></button>
      </div>
    </header>
  )
}
