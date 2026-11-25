import { useState } from 'react'
import { Bookmark, GitFork, History, RotateCcw, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, Input, Tooltip } from '@/ui/primitives'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { formatBytes, timeAgo } from '@/lib/util'
import { toast } from '@/store/toast'
import { forkFromCheckpoint } from '@/core/vfs/projects'
import { navigateToProject } from '@/store/app'
import { useProjects } from '@/store/projects'
import { countLineChanges } from '@/core/vfs/lineDiff'
import type { CheckpointMeta, FileDiff } from '@/core/vfs/types'
import { cn } from '@/lib/cn'

const tone = { auto: 'neutral', manual: 'accent', ai: 'success', restore: 'warn' } as const

export function HistoryPanel({ onOpenDiff }: { onOpenDiff?: (path: string, before: string, after: string, label: string) => void }) {
  const vfs = useWorkspace((s) => s.vfs)
  useVfsVersion(vfs)
  const [label, setLabel] = useState('')
  const [compare, setCompare] = useState<{ cp: CheckpointMeta; diffs: FileDiff[] } | null>(null)
  if (!vfs) return null
  const cps = vfs.listCheckpoints()
  const ptr = vfs.meta.historyPtr

  const doCompare = async (cp: CheckpointMeta) => {
    if (compare?.cp.id === cp.id) return setCompare(null)
    setCompare({ cp, diffs: await vfs.diffAgainstCheckpoint(cp.id) })
  }
  const restore = async (cp: CheckpointMeta) => {
    await vfs.restore(cp.id)
    setCompare(null)
    toast.success('Checkpoint restored', cp.label)
  }
  const fork = async (cp: CheckpointMeta) => {
    const p = await forkFromCheckpoint(vfs.adapter, vfs, cp.id)
    await useProjects.getState().refresh()
    toast.success('Forked into a new project', p.name)
    navigateToProject(p.id)
  }

  return (
    <div className="flex h-full flex-col">
      <form
        className="flex shrink-0 gap-2 border-b border-line p-3"
        onSubmit={async (e) => {
          e.preventDefault()
          await vfs.checkpoint(label.trim() || `Manual checkpoint ${new Date().toLocaleTimeString()}`, 'manual')
          setLabel('')
          toast.success('Checkpoint saved')
        }}
      >
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Checkpoint name (optional)" className="h-8 text-xs" />
        <Button type="submit" size="sm" variant="primary"><Bookmark size={13} />Save</Button>
      </form>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {cps.length === 0 && <EmptyState icon={<History size={20} />} title="No checkpoints yet">Every AI turn and manual save creates an immutable snapshot you can restore, fork or diff.</EmptyState>}
        {[...cps].reverse().map((cp) => {
          const idx = cps.indexOf(cp)
          const current = idx === ptr && !vfs.isDirty()
          return (
            <div key={cp.id} className={cn('mb-1.5 rounded-xl border p-2.5', current ? 'border-accent/40 bg-accent/5' : 'border-line')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{cp.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{timeAgo(cp.createdAt)} · {cp.fileCount} files · {formatBytes(cp.bytes)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Badge tone={tone[cp.kind]}>{current ? 'current' : cp.kind}</Badge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button size="xs" variant="secondary" disabled={current} onClick={() => restore(cp)}><RotateCcw size={11} />Restore</Button>
                <Button size="xs" variant="secondary" onClick={() => fork(cp)}><GitFork size={11} />Fork</Button>
                <Button size="xs" variant={compare?.cp.id === cp.id ? 'primary' : 'secondary'} onClick={() => doCompare(cp)}>Diff vs now</Button>
                <Tooltip label="Delete checkpoint"><Button size="xs" variant="ghost" onClick={() => vfs.deleteCheckpoint(cp.id)} aria-label="Delete checkpoint"><Trash2 size={11} /></Button></Tooltip>
              </div>
              {compare?.cp.id === cp.id && (
                <div className="mt-2 rounded-lg bg-subtle p-2">
                  {compare.diffs.length === 0 ? <p className="text-xs text-muted">Identical to the current state.</p> : compare.diffs.map((d) => {
                    const c = countLineChanges(d.before ?? '', d.after ?? '')
                    return (
                      <button key={d.path} onClick={() => onOpenDiff?.(d.path, d.before ?? '', d.after ?? '', cp.label)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left font-mono text-[11px] hover:bg-panel">
                        <span className={cn('w-3 font-bold', d.status === 'added' ? 'text-success' : d.status === 'removed' ? 'text-danger' : 'text-warn')}>{d.status === 'added' ? 'A' : d.status === 'removed' ? 'D' : 'M'}</span>
                        <span className="flex-1 truncate">{d.path}</span>
                        <span className="text-success">+{c.added}</span><span className="text-danger">−{c.removed}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
