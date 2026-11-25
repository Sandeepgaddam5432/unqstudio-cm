import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { allProviders, configFor } from '@/store/aiConfig'
import { useSettings } from '@/store/settings'
import { useApp } from '@/store/app'
import { cn } from '@/lib/cn'

/**
 * Model picker body (used inside the anchored popover on desktop and inside the bottom sheet on mobile).
 * Layout: sticky search + provider filter pills on top, scrollable grouped list below.
 */
export function ModelPicker({ close }: { close: () => void }) {
  const s = useSettings()
  const [q, setQ] = useState('')
  const [pf, setPf] = useState<string>('all')
  const providers = allProviders().filter((p) => s.enabled[p.id] !== false)

  const groups = useMemo(() => providers
    .filter((p) => pf === 'all' || p.id === pf)
    .map((p) => ({ p, models: [...p.models.map((x) => x.id), ...(s.userModels[p.id] ?? [])].filter((id) => id.toLowerCase().includes(q.toLowerCase())) }))
    .filter((g) => g.models.length), [providers, pf, q, s.userModels])

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-model-picker>
      <div className="sticky top-0 z-10 shrink-0 space-y-2 bg-panel p-2 pb-1.5">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-subtle px-2.5 text-muted focus-within:border-line-strong focus-within:ring-2 focus-within:ring-accent/20">
          <Search size={14} className="shrink-0" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models…" aria-label="Search models" className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint" />
        </label>
        <div className="scrollbar-none -mx-0.5 flex gap-1 overflow-x-auto px-0.5" role="tablist" aria-label="Provider filter">
          {[{ id: 'all', name: 'All' }, ...providers.map((p) => ({ id: p.id, name: p.name }))].map((t) => (
            <button key={t.id} role="tab" aria-selected={pf === t.id} onClick={() => setPf(t.id)} className={cn('h-6 shrink-0 rounded-full border px-2.5 text-[11px] font-medium transition-colors duration-150', pf === t.id ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg')}>{t.name}</button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1">
        {groups.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">No models match “{q}”.</p>}
        {groups.map(({ p, models }) => {
          const c = configFor(p.id)
          return (
            <div key={p.id} className="mb-1">
              <div className="flex items-center justify-between px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
                <span className="truncate">{p.name}</span>
                {c.error && <span className="shrink-0 normal-case tracking-normal text-warn">needs key</span>}
              </div>
              {models.map((id) => (
                <button key={id} onClick={() => { s.set({ activeProvider: p.id, activeModel: id }); close(); if (c.error === 'nokey') useApp.getState().setOnboardingOpen(true) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-150 hover:bg-subtle sm:py-1.5">
                  <span className="min-w-0 flex-1 truncate">{id}</span>
                  {s.activeProvider === p.id && s.activeModel === id && <Check size={13} className="shrink-0 text-accent" />}
                </button>
              ))}
            </div>
          )
        })}
      </div>
      <div className="flex shrink-0 gap-1 border-t border-line p-1">
        <button onClick={() => { close(); useApp.getState().setOnboardingOpen(true) }} className="flex-1 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:bg-subtle hover:text-fg">Quick setup…</button>
        <button onClick={() => { close(); useApp.getState().openSettings('providers') }} className="flex-1 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:bg-subtle hover:text-fg">All providers…</button>
      </div>
    </div>
  )
}
