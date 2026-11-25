import { useMemo, useState } from 'react'
import { CaseSensitive, Regex, Replace, Search, WholeWord } from 'lucide-react'
import { Button, EmptyState, Input } from '@/ui/primitives'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { toast } from '@/store/toast'
import { cn } from '@/lib/cn'
import type { SearchHit } from '@/core/vfs/vfs'

export function SearchPanel() {
  const vfs = useWorkspace((s) => s.vfs)
  const revealAt = useWorkspace((s) => s.revealAt)
  const version = useVfsVersion(vfs)
  const [q, setQ] = useState('')
  const [rep, setRep] = useState('')
  const [cs, setCs] = useState(false)
  const [rx, setRx] = useState(false)
  const [ww, setWw] = useState(false)

  const { hits, error } = useMemo(() => {
    if (!vfs || !q) return { hits: [] as SearchHit[], error: '' }
    try { return { hits: vfs.search(q, { caseSensitive: cs, regex: rx, wholeWord: ww }), error: '' } } catch (e) { return { hits: [], error: (e as Error).message } }
  }, [vfs, version, q, cs, rx, ww])
  const groups = useMemo(() => { const m = new Map<string, SearchHit[]>(); for (const h of hits) m.set(h.path, [...(m.get(h.path) ?? []), h]); return [...m] }, [hits])
  if (!vfs) return null

  const replace = async (only?: string[]) => {
    const r = await vfs.replaceAll(q, rep, { caseSensitive: cs, regex: rx, wholeWord: ww, onlyPaths: only })
    toast.success(`Replaced ${r.replacements} in ${r.files} file${r.files === 1 ? '' : 's'}`, r.skippedLocked.length ? `Skipped locked: ${r.skippedLocked.join(', ')}` : undefined)
  }
  const Toggle = ({ on, set, label, children }: { on: boolean; set: (v: boolean) => void; label: string; children: React.ReactNode }) => (
    <button onClick={() => set(!on)} aria-pressed={on} aria-label={label} title={label} className={cn('rounded p-1', on ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg')}>{children}</button>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1.5 border-b border-line p-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all files" className="h-8 pl-8 pr-20 text-xs" aria-label="Search" />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2"><Toggle on={cs} set={setCs} label="Match case"><CaseSensitive size={14} /></Toggle><Toggle on={ww} set={setWw} label="Whole word"><WholeWord size={14} /></Toggle><Toggle on={rx} set={setRx} label="Regex"><Regex size={14} /></Toggle></div>
        </div>
        <div className="flex gap-1.5">
          <Input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Replace with" className="h-8 text-xs" aria-label="Replace" />
          <Button size="sm" disabled={!hits.length} onClick={() => void replace()}><Replace size={13} />All</Button>
        </div>
        {error && <p className="text-[11px] text-danger">{error}</p>}
        {q && !error && <p className="text-[11px] text-muted">{hits.length} result{hits.length === 1 ? '' : 's'} in {groups.length} file{groups.length === 1 ? '' : 's'}{hits.length >= 1000 ? ' (capped)' : ''}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {!q && <EmptyState icon={<Search size={20} />} title="Search & replace">Find text or regex across the whole project. Locked files are never replaced.</EmptyState>}
        {groups.map(([path, hs]) => (
          <div key={path} className="mb-1.5">
            <div className="group flex items-center justify-between px-1.5 py-1 font-mono text-[11px] text-muted">
              <span className="truncate">{path} <span className="text-faint">({hs.length})</span>{vfs.isLocked(path) && ' 🔒'}</span>
              <button onClick={() => void replace([path])} className="hidden rounded px-1 text-[10px] hover:bg-subtle group-hover:block">Replace</button>
            </div>
            {hs.slice(0, 50).map((h, i) => (
              <button key={i} onClick={() => revealAt(h.path, h.line, h.col)} className="flex w-full gap-2 rounded px-1.5 py-0.5 text-left font-mono text-[11px] hover:bg-subtle">
                <span className="w-7 shrink-0 text-right text-faint">{h.line}</span>
                <span className="truncate">{h.text.slice(Math.max(0, h.col - 30), h.col - 1)}<mark className="rounded bg-warn/30 px-px text-fg">{h.text.slice(h.col - 1, h.col - 1 + h.length)}</mark>{h.text.slice(h.col - 1 + h.length, h.col + 80)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
