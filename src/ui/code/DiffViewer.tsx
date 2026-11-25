import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Columns2, Rows2, Undo2, X } from 'lucide-react'
import { Button, Dropdown, Segmented } from '@/ui/primitives'
import { buildSplitRows, buildUnifiedRows, countLineChanges } from '@/core/vfs/lineDiff'
import { useWorkspace, type DiffTarget } from '@/store/workspace'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/lib/util'
import { toast } from '@/store/toast'
import type { CheckpointMeta } from '@/core/vfs/types'

const cellCls = { ctx: '', del: 'bg-danger/10', add: 'bg-success/10' }
const markCls = { ctx: 'text-faint', del: 'text-danger', add: 'text-success' }

export function DiffViewer({ target, onClose }: { target: DiffTarget; onClose: () => void }) {
  const vfs = useWorkspace((s) => s.vfs)
  const [view, setView] = useState<'split' | 'unified'>('split')
  const [cur, setCur] = useState<DiffTarget>(target)
  const [cps, setCps] = useState<CheckpointMeta[]>([])
  useEffect(() => setCur(target), [target])
  useEffect(() => { setCps(vfs ? vfs.listCheckpoints().slice().reverse() : []) }, [vfs, target])

  const split = useMemo(() => buildSplitRows(cur.before, cur.after), [cur])
  const unified = useMemo(() => buildUnifiedRows(cur.before, cur.after), [cur])
  const counts = useMemo(() => countLineChanges(cur.before, cur.after), [cur])

  const compareWith = async (cp: CheckpointMeta) => {
    if (!vfs) return
    const snap = await vfs.getCheckpointSnapshot(cp.id)
    setCur({ path: cur.path, before: snap[cur.path]?.c ?? '', after: vfs.read(cur.path) ?? '', label: `vs “${cp.label}”`, existed: !!snap[cur.path] })
  }
  const revert = async () => {
    if (!vfs) return
    if (cur.existed === false) await vfs.remove(cur.path)
    else await vfs.write(cur.path, cur.before, { actor: 'user' })
    toast.success('Reverted', cur.path)
    onClose()
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
        <span className="truncate font-mono text-xs">{cur.path}</span>
        <span className="hidden truncate text-[11px] text-muted sm:block">{cur.label}</span>
        <span className="font-mono text-[11px]"><span className="text-success">+{counts.added}</span> <span className="text-danger">−{counts.removed}</span></span>
        <div className="ml-auto flex items-center gap-1.5">
          <Dropdown
            align="end"
            width={260}
            trigger={<Button size="xs" variant="secondary">Compare with<ChevronDown size={11} /></Button>}
            items={cps.length ? cps.slice(0, 30).map((cp) => ({ label: cp.label, hint: timeAgo(cp.createdAt), onSelect: () => void compareWith(cp) })) : [{ label: 'No checkpoints', disabled: true }]}
          />
          <Segmented size="sm" value={view} onChange={setView} items={[{ id: 'split', label: <Columns2 size={12} /> }, { id: 'unified', label: <Rows2 size={12} /> }]} />
          <Button size="xs" variant="secondary" onClick={revert}><Undo2 size={11} />Revert</Button>
          <Button size="xs" variant="primary" onClick={onClose}><Check size={11} />Accept</Button>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close diff"><X size={14} /></Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-[1.55]">
        {cur.before === cur.after ? <p className="p-6 text-center font-sans text-sm text-muted">No differences.</p>
        : view === 'split' ? (
          <table className="w-full table-fixed border-collapse">
            <tbody>
              {split.map((r, i) => r.skip ? (
                <tr key={i}><td colSpan={4} className="bg-subtle py-0.5 text-center font-sans text-[11px] text-faint">⋯ {r.skip} unchanged lines</td></tr>
              ) : (
                <tr key={i}>
                  {(['left', 'right'] as const).map((side) => {
                    const c = r[side]
                    return [
                      <td key={side + 'n'} className={cn('w-10 select-none px-2 text-right align-top', c ? cn(cellCls[c.type], markCls[c.type]) : 'bg-subtle/50')}>{c?.n}</td>,
                      <td key={side + 't'} className={cn('whitespace-pre-wrap break-all px-2 align-top', side === 'left' && 'border-r border-line', c ? cellCls[c.type] : 'bg-subtle/50')}>{c?.text}</td>,
                    ]
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {unified.map((r, i) => r.skip ? (
                <tr key={i}><td colSpan={3} className="bg-subtle py-0.5 text-center font-sans text-[11px] text-faint">⋯ {r.skip} unchanged lines</td></tr>
              ) : (
                <tr key={i} className={cellCls[r.cell!.type]}>
                  <td className={cn('w-10 select-none px-2 text-right align-top', markCls[r.cell!.type])}>{r.cell!.n}</td>
                  <td className={cn('w-4 select-none align-top', markCls[r.cell!.type])}>{r.cell!.type === 'add' ? '+' : r.cell!.type === 'del' ? '−' : ''}</td>
                  <td className="whitespace-pre-wrap break-all px-2 align-top">{r.cell!.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
