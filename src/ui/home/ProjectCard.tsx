import { Copy, Download, Eye, MoreHorizontal, Pencil, Pin, PinOff, SlidersHorizontal, Star, Trash2 } from 'lucide-react'
import { Button, Dropdown } from '@/ui/primitives'
import { projectSnapshot } from '@/core/vfs/projects'
import { getAdapter } from '@/core/vfs/idbAdapter'
import { downloadBlob, slugify, timeAgo } from '@/lib/util'
import { useProjects } from '@/store/projects'
import { navigateToProject, useApp } from '@/store/app'
import { toast } from '@/store/toast'
import type { ProjectMeta } from '@/core/vfs/types'

export function ProjectCard({ p, onRename, onDelete }: { p: ProjectMeta; onRename: () => void; onDelete: () => void }) {
  const projects = useProjects()
  const openSettings = useApp((s) => s.openProjectSettings)
  const initial = p.name.trim()[0]?.toUpperCase() ?? '?'
  const exportZip = async () => {
    try {
      const { exportZip: zip } = await import('@/core/vfs/zip')
      downloadBlob(await zip(await projectSnapshot(getAdapter(), p.id), p.name, { scaffold: true }), `${slugify(p.name)}.zip`)
      toast.success('ZIP exported')
    } catch (e) { toast.error('Export failed', e instanceof Error ? e.message : String(e)) }
  }
  return (
    <div data-project-card onClick={() => navigateToProject(p.id)} className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-primary shadow-xs-surface transition duration-200 hover:shadow-md-surface">
      <div className="dot-grid relative flex aspect-video items-center justify-center overflow-hidden border-b border-line bg-subtle">
        {p.thumbnail ? <img src={p.thumbnail} alt={`${p.name} preview`} loading="lazy" className="h-full w-full object-cover object-top" /> : <span className="text-4xl font-semibold tracking-tight text-faint">{initial}</span>}
        <button onClick={(e) => { e.stopPropagation(); void projects.update(p.id, { starred: !p.starred, updatedAt: p.updatedAt }) }} aria-label={p.starred ? 'Unstar project' : 'Star project'} aria-pressed={!!p.starred} className="press absolute right-2 top-2 flex h-9 w-9 md:opacity-0 md:transition-opacity md:duration-150 md:focus-visible:opacity-100 md:group-hover:opacity-100 items-center justify-center rounded-full bg-panel/85 shadow-sm backdrop-blur"><Star size={15} className={p.starred ? 'fill-accent text-accent' : 'text-muted'} /></button>
      </div>
      <div className="flex items-start justify-between gap-2 p-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">{p.pinned && <Pin size={11} className="shrink-0 text-accent" />}<h3 className="truncate text-sm font-semibold">{p.name}</h3></div>
          <p className="mt-0.5 text-xs text-muted">Edited {timeAgo(p.updatedAt)}{p.forkOf ? ' · remix' : ''}</p>
        </div>
        <div onClick={(e) => e.stopPropagation()} className="md:opacity-0 md:transition-opacity md:duration-150 md:focus-within:opacity-100 md:group-hover:opacity-100">
          <Dropdown align="end" width={210} mobileSheet sheetTitle={p.name} trigger={<Button variant="ghost" size="icon" aria-label="Project actions"><MoreHorizontal size={16} /></Button>}
            items={[
              { label: 'Open', icon: <Eye size={14} />, onSelect: () => navigateToProject(p.id) },
              { label: 'Rename', icon: <Pencil size={14} />, onSelect: onRename },
              { label: 'Fork / Remix', icon: <Copy size={14} />, onSelect: async () => { const c = await projects.duplicate(p.id); toast.success('Remixed', c.name) } },
              { label: 'Project settings', icon: <SlidersHorizontal size={14} />, onSelect: () => { navigateToProject(p.id); openSettings() } },
              { label: 'Export ZIP', icon: <Download size={14} />, onSelect: exportZip },
              { label: p.pinned ? 'Unpin' : 'Pin to top', icon: p.pinned ? <PinOff size={14} /> : <Pin size={14} />, onSelect: () => projects.update(p.id, { pinned: !p.pinned, updatedAt: p.updatedAt }) },
              { separator: true },
              { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: onDelete },
            ]} />
        </div>
      </div>
    </div>
  )
}
