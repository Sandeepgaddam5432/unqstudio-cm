import { useEffect, useMemo, useState } from 'react'
import { Copy, Eye, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { Button, ConfirmModal, Dropdown, Input, Modal } from '@/ui/primitives'
import { useProjects } from '@/store/projects'
import { navigateToProject } from '@/store/app'
import { useIsMobile } from '@/lib/useMedia'
import { matchesProject } from '@/lib/projectFilters'
import { timeAgo } from '@/lib/util'
import { toast } from '@/store/toast'
import { cn } from '@/lib/cn'
import { ProjectCard } from './ProjectCard'
import { AccountAvatarButton } from '@/ui/layout/WorkspaceSwitcher'
import { usePaneActive } from '@/ui/layout/MobileShell'
import { NewProjectSheet } from './NewProjectSheet'
import type { ProjectMeta } from '@/core/vfs/types'

type Sort = 'recent' | 'name' | 'starred' | 'pinned'
const SORTS: { id: Sort; label: string }[] = [{ id: 'recent', label: 'Recently edited' }, { id: 'name', label: 'Name A–Z' }, { id: 'starred', label: 'Starred only' }, { id: 'pinned', label: 'Pinned only' }]

export function applySort(ps: ProjectMeta[], sort: Sort): ProjectMeta[] {
  const out = ps.filter((p) => (sort === 'starred' ? p.starred : sort === 'pinned' ? p.pinned : true))
  if (sort === 'name') return [...out].sort((a, b) => a.name.localeCompare(b.name))
  return [...out].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
}

function Row({ p, onRename, onDelete }: { p: ProjectMeta; onRename: () => void; onDelete: () => void }) {
  const projects = useProjects()
  return (
    <div data-project-row onClick={() => navigateToProject(p.id)} className="flex h-[88px] cursor-pointer items-center gap-3 px-4 hover:bg-depth/60 active:bg-depth">
      <div className="dot-grid flex h-[72px] w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-depth shadow-xs-surface">
        {p.thumbnail ? <img src={p.thumbnail} alt={`${p.name} preview`} loading="lazy" className="h-full w-full object-cover object-top" /> : <span className="text-xl font-semibold text-fg-quaternary">{p.name.trim()[0]?.toUpperCase() ?? '?'}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[14px] font-medium">{p.name}</h3>
        <p className="t-meta mt-0.5 text-fg-tertiary">Edited {timeAgo(p.updatedAt)}</p>
      </div>
      <button onClick={(e) => { e.stopPropagation(); void projects.update(p.id, { pinned: !p.pinned, updatedAt: p.updatedAt }) }} aria-label={p.pinned ? 'Unpin project' : 'Pin project'} aria-pressed={p.pinned} className="press flex h-11 w-11 items-center justify-center rounded-full hover:bg-depth">
        <Pin size={15} className={p.pinned ? 'fill-accent text-accent' : 'text-fg-quaternary'} />
      </button>
      <div onClick={(e) => e.stopPropagation()}>
        <Dropdown align="end" width={200} mobileSheet sheetTitle={p.name} trigger={<Button variant="ghost" size="icon" aria-label="Project actions"><MoreHorizontal size={17} /></Button>}
          items={[
            { label: 'Open', icon: <Eye size={14} />, onSelect: () => navigateToProject(p.id) },
            { label: 'Rename', icon: <Pencil size={14} />, onSelect: onRename },
            { label: 'Fork / Remix', icon: <Copy size={14} />, onSelect: async () => { const c = await projects.duplicate(p.id); toast.success('Remixed', c.name) } },
            { label: p.pinned ? 'Unpin' : 'Pin to top', icon: p.pinned ? <PinOff size={14} /> : <Pin size={14} />, onSelect: () => projects.update(p.id, { pinned: !p.pinned, updatedAt: p.updatedAt }) },
            { separator: true },
            { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: onDelete },
          ]} />
      </div>
    </div>
  )
}

/** Dedicated Projects view: mobile = 88px list rows; desktop = responsive 16:9 card grid with hover-only actions. */
export default function ProjectsView() {
  const projects = useProjects()
  const mobile = useIsMobile()
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [sort, setSort] = useState<Sort>('recent')
  const [renaming, setRenaming] = useState<ProjectMeta | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [deleting, setDeleting] = useState<ProjectMeta | null>(null)
  useEffect(() => { void projects.refresh() }, [])
  const list = useMemo(() => applySort(projects.projects.filter((p) => matchesProject(p, q)), sort), [projects.projects, q, sort])
  const active = usePaneActive()
  const [newOpen, setNewOpen] = useState(false)

  return (
    <div data-projects-view className="mx-auto min-h-full w-full max-w-6xl bg-base pb-40 md:px-8">
      <header className="sticky top-0 z-20 bg-base/85 px-4 pb-2 backdrop-blur-xl md:px-0" style={{ paddingTop: 'calc(var(--sat, 0px) + 12px)' }}>
        <div className="flex h-12 items-center justify-between gap-2">
          <h1 className="text-[20px] font-semibold tracking-tight">Projects <span data-project-count className="t-meta font-normal text-fg-quaternary">{projects.projects.length}</span></h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Search projects" aria-pressed={searching} onClick={() => { setSearching((v) => !v); if (searching) setQ('') }}><Search size={18} /></Button>
            <Dropdown align="end" width={210} mobileSheet sheetTitle="Filter projects" trigger={<Button variant="ghost" size="icon" aria-label="Filter projects" className={cn(sort !== 'recent' && 'text-accent')}><SlidersHorizontal size={18} /></Button>}
              items={SORTS.map((s) => ({ label: s.label, checked: sort === s.id, onSelect: () => setSort(s.id) }))} />
            {mobile && <AccountAvatarButton />}
          </div>
        </div>
        {searching && (
          <div className="relative pb-2">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-[calc(50%+4px)] text-fg-quaternary" />
            <Input autoFocus={!mobile} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" aria-label="Search projects" className="h-10 pl-9 pr-9" />
            {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-[calc(50%+4px)] p-1 text-fg-tertiary"><X size={14} /></button>}
          </div>
        )}
      </header>

      {!projects.loaded ? (
        <div className="space-y-1 px-4 md:px-0">{[0, 1, 2, 3].map((i) => <div key={i} className="skel h-[88px]" />)}</div>
      ) : list.length === 0 ? (
        <div className="mx-4 mt-6 rounded-2xl border border-dashed border-line-strong py-16 text-center text-sm text-fg-tertiary md:mx-0">{projects.projects.length ? 'No projects match.' : 'No projects yet — start one from Home.'}</div>
      ) : mobile ? (
        <div className="divide-y divide-line" data-project-list>{list.map((p) => <Row key={p.id} p={p} onRename={() => { setRenaming(p); setRenameVal(p.name) }} onDelete={() => setDeleting(p)} />)}</div>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-project-grid>
          {list.map((p) => <ProjectCard key={p.id} p={p} onRename={() => { setRenaming(p); setRenameVal(p.name) }} onDelete={() => setDeleting(p)} />)}
        </div>
      )}

      {(!mobile || active) && (
        <div className="pointer-events-none fixed inset-x-0 z-30 flex justify-center md:inset-x-auto md:right-8 md:justify-end" style={{ bottom: mobile ? 'calc(var(--sab, 0px) + 84px)' : '1.5rem' }}>
          <button onClick={() => setNewOpen(true)} data-new-project className="press pointer-events-auto flex h-12 items-center gap-1.5 rounded-full bg-fg-primary px-5 text-[14px] font-medium text-base shadow-floating">
            <Plus size={17} />New project
          </button>
        </div>
      )}
      <NewProjectSheet open={newOpen} onClose={() => setNewOpen(false)} />

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename project" size="sm"
        footer={<><Button variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button><Button variant="primary" onClick={async () => { if (renaming && renameVal.trim()) { await projects.update(renaming.id, { name: renameVal.trim() }); setRenaming(null) } }}>Save</Button></>}>
        <Input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </Modal>
      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} danger title="Delete project?" message={<>“{deleting?.name}” and all of its files, checkpoints and chat will be permanently removed from this browser.</>} confirmLabel="Delete"
        onConfirm={async () => { if (deleting) { await projects.remove(deleting.id); toast.success('Project deleted'); setDeleting(null) } }} />
    </div>
  )
}
