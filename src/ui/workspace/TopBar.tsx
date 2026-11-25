import { useEffect, useRef, useState } from 'react'
import { Bookmark, Code2, Command, MoreHorizontal, Moon, Redo2, Rocket, Settings, Sparkles, Sun, Undo2 } from 'lucide-react'
import { Button, Dropdown, Logo, Segmented, Tooltip, Kbd } from '@/ui/primitives'
import { navigateHome, useApp } from '@/store/app'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { toast } from '@/store/toast'

export function TopBar() {
  const { mode, setMode, resolvedTheme, toggleTheme, openSettings, setPublishOpen, setPaletteOpen } = useApp()
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
  const undo = async () => {
    if (!vfs) return
    toast.info((await vfs.undo()) ? 'Restored previous checkpoint' : 'Nothing to undo')
  }
  const redo = async () => {
    if (!vfs) return
    toast.info((await vfs.redo()) ? 'Re-applied next checkpoint' : 'Nothing to redo')
  }
  const checkpoint = async () => {
    if (!vfs) return
    const cp = await vfs.checkpoint(`Manual checkpoint ${new Date().toLocaleTimeString()}`, 'manual')
    toast.success('Checkpoint saved', cp.label)
  }
  const canUndo = !!vfs?.canUndo()
  const canRedo = !!vfs?.canRedo()

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-2 sm:px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <Tooltip label="All projects"><button onClick={navigateHome} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-subtle" aria-label="Back to projects"><Logo size={20} /></button></Tooltip>
        <span className="hidden text-faint sm:block">/</span>
        {editing ? (
          <input
            ref={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') void commit(); if (e.key === 'Escape') setEditing(false) }}
            className="h-7 w-36 rounded-md border border-accent/60 bg-subtle px-2 text-sm font-medium outline-none sm:w-52"
            aria-label="Project name"
          />
        ) : (
          <Tooltip label="Rename project">
            <button onClick={() => { setName(vfs?.meta.name ?? ''); setEditing(true) }} className="max-w-[9rem] truncate rounded-md px-2 py-1 text-sm font-medium hover:bg-subtle sm:max-w-[16rem]">
              {vfs?.meta.name ?? '…'}
            </button>
          </Tooltip>
        )}
      </div>

      <Tooltip label="Switch workspace" hint="⌘E">
        <span>
          <Segmented
            value={mode}
            onChange={setMode}
            items={[
              { id: 'studio', label: <span className="hidden sm:inline">Studio</span>, icon: <Sparkles size={13} /> },
              { id: 'code', label: <span className="hidden sm:inline">Code</span>, icon: <Code2 size={13} /> },
            ]}
          />
        </span>
      </Tooltip>

      <div className="flex items-center gap-0.5 sm:gap-1">
        <div className="hidden items-center gap-0.5 sm:flex">
          <Tooltip label="Undo to previous checkpoint"><Button variant="ghost" size="icon-sm" disabled={!canUndo} onClick={undo} aria-label="Undo"><Undo2 size={15} /></Button></Tooltip>
          <Tooltip label="Redo"><Button variant="ghost" size="icon-sm" disabled={!canRedo} onClick={redo} aria-label="Redo"><Redo2 size={15} /></Button></Tooltip>
          <Tooltip label="Save checkpoint"><Button variant="ghost" size="icon-sm" onClick={checkpoint} aria-label="Save checkpoint"><Bookmark size={15} /></Button></Tooltip>
          <Tooltip label="Command palette" hint="⌘K"><Button variant="ghost" size="sm" onClick={() => setPaletteOpen(true)} aria-label="Command palette"><Command size={14} /><Kbd>K</Kbd></Button></Tooltip>
        </div>
        <Tooltip label="Toggle theme"><Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Toggle theme">{resolvedTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</Button></Tooltip>
        <Tooltip label="Settings"><Button variant="ghost" size="icon-sm" onClick={() => openSettings()} aria-label="Settings"><Settings size={15} /></Button></Tooltip>
        <div className="sm:hidden">
          <Dropdown
            align="end"
            trigger={<Button variant="ghost" size="icon-sm" aria-label="More"><MoreHorizontal size={15} /></Button>}
            items={[
              { label: 'Undo', icon: <Undo2 size={14} />, disabled: !canUndo, onSelect: undo },
              { label: 'Redo', icon: <Redo2 size={14} />, disabled: !canRedo, onSelect: redo },
              { label: 'Save checkpoint', icon: <Bookmark size={14} />, onSelect: checkpoint },
              { label: 'Command palette', icon: <Command size={14} />, onSelect: () => setPaletteOpen(true) },
            ]}
          />
        </div>
        <Button variant="accent" size="sm" onClick={() => setPublishOpen(true)} className="ml-1">
          <Rocket size={13} />
          <span className="hidden sm:inline">Publish</span>
        </Button>
      </div>
    </header>
  )
}
