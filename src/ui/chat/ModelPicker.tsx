import { useEffect, useMemo, useState } from 'react'
import { Brain, Check, Eye, RefreshCw, Search, Wrench } from 'lucide-react'
import { allProviders, fetchLiveFor, isConfigured, isProviderEnabled, modelsForProvider } from '@/store/aiConfig'
import { useModels } from '@/store/models'
import { useSettings } from '@/store/settings'
import { useApp } from '@/store/app'
import { useVault } from '@/store/vault'
import { configFor } from '@/store/aiConfig'
import { Spinner } from '@/ui/primitives'
import { formatTokens } from '@/core/ai/tokens'
import { cn } from '@/lib/cn'
import { ago } from '@/ui/settings/registryUi'

export type PickerTab = 'configured' | 'ready' | 'local' | 'all'
const TABS: { id: PickerTab; label: string }[] = [
  { id: 'configured', label: 'Configured ⭐' }, { id: 'ready', label: 'Browser-Ready 🟢' }, { id: 'local', label: 'Local 💻' }, { id: 'all', label: 'All Providers' },
]
const MAX_GROUPS = 60
const MAX_MODELS = 40

/**
 * Model picker body (anchored popover on desktop, bottom sheet on mobile).
 * Sticky search + compatibility filter tabs on top; collapsible provider groups below.
 * Models are resolved live-first (see modelsForProvider) — nothing here is hard-coded.
 */
export function ModelPicker({ close }: { close: () => void }) {
  const s = useSettings()
  useVault((v) => v.rev)
  const registry = useModels((m) => m.registry)
  const live = useModels((m) => m.live)
  const syncedAt = useModels((m) => m.syncedAt)
  const status = useModels((m) => m.registryStatus)
  const providers = allProviders()
  const configuredList = providers.filter((p) => isProviderEnabled(p) && isConfigured(p))
  const [tab, setTab] = useState<PickerTab>(configuredList.length ? 'configured' : 'ready')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set([s.activeProvider]))
  const [more, setMore] = useState<Set<string>>(new Set())

  // Auto-fetch the live model list for configured providers that have not been queried yet.
  useEffect(() => { for (const p of configuredList) { const st = live[p.id]?.status; if (!st || st === 'idle') void fetchLiveFor(p) } }, [])

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = providers.filter((p) => {
      if (tab === 'configured') return isProviderEnabled(p) && isConfigured(p)
      if (tab === 'ready') return p.compat === 'browser-ready'
      if (tab === 'local') return p.compat === 'local'
      return true
    })
    const out: { p: (typeof providers)[number]; models: ReturnType<typeof modelsForProvider>; total: number }[] = []
    for (const p of list) {
      if (!ql && !open.has(p.id)) { out.push({ p, models: [], total: -1 }); continue }
      const all = p.compat === 'requires-proxy' ? [] : modelsForProvider(p)
      const models = ql ? all.filter((m) => m.id.toLowerCase().includes(ql) || m.name.toLowerCase().includes(ql) || p.name.toLowerCase().includes(ql)) : all
      if (ql && !models.length) continue
      out.push({ p, models, total: models.length })
    }
    return out
  }, [tab, q, open, registry, live, s.userModels, s.enabled, providers.length])

  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const pick = (providerId: string, id: string) => {
    const c = configFor(providerId)
    s.set({ activeProvider: providerId, activeModel: id, enabled: { ...s.enabled, [providerId]: true } })
    close()
    if (c.error === 'nokey') useApp.getState().openSettings('providers')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-model-picker>
      <div className="sticky top-0 z-10 shrink-0 space-y-2 bg-panel p-2 pb-1.5">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-subtle px-2.5 text-muted focus-within:border-line-strong focus-within:ring-2 focus-within:ring-accent/20">
          <Search size={14} className="shrink-0" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models & providers…" aria-label="Search models" className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint" />
        </label>
        <div className="scrollbar-none -mx-0.5 flex gap-1 overflow-x-auto px-0.5" role="tablist" aria-label="Provider filter">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn('h-6 shrink-0 rounded-full border px-2.5 text-[11px] font-medium transition-colors duration-150', tab === t.id ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg')}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1" data-picker-list>
        {groups.length === 0 && (
          <p className="px-3 py-8 text-center text-xs text-muted">{tab === 'configured' && !q ? 'No configured providers yet. Add an API key in “All providers…”, or browse the Browser-Ready tab.' : q ? `No models match “${q}”.` : 'Nothing here.'}</p>
        )}
        {groups.slice(0, MAX_GROUPS).map(({ p, models, total }) => {
          const expanded = total >= 0
          const lv = live[p.id]
          const showAll = more.has(p.id)
          return (
            <div key={p.id} className="mb-0.5" data-provider-group={p.id}>
              <button onClick={() => toggle(p.id)} aria-expanded={expanded} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-subtle">
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wider text-faint">{p.name}</span>
                {lv?.status === 'loading' && <Spinner size={11} />}
                {lv?.status === 'ok' && <span className="shrink-0 rounded bg-success/10 px-1 text-[9px] font-medium normal-case text-success">live</span>}
                {p.compat === 'requires-proxy' && <span className="shrink-0 text-[10px] normal-case text-warn">Requires Proxy 🔌</span>}
                {p.compat !== 'requires-proxy' && !isConfigured(p) && <span className="shrink-0 text-[10px] normal-case text-warn">needs key</span>}
              </button>
              {expanded && p.compat === 'requires-proxy' && <p className="px-2.5 pb-2 text-[11px] leading-snug text-muted">Needs server-side credentials (IAM / signed requests) — route it through a gateway such as OpenRouter or your own proxy.</p>}
              {expanded && (showAll ? models : models.slice(0, MAX_MODELS)).map((m) => (
                <button key={m.id} onClick={() => pick(p.id, m.id)} title={m.id} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-150 hover:bg-subtle sm:py-1.5">
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {m.vision && <Eye size={11} className="shrink-0 text-faint" aria-label="vision" />}
                  {m.reasoning && <Brain size={11} className="shrink-0 text-faint" aria-label="reasoning" />}
                  {m.tool_call && <Wrench size={11} className="hidden shrink-0 text-faint sm:block" aria-label="tools" />}
                  {m.context ? <span className="hidden shrink-0 font-mono text-[10px] text-faint sm:block">{formatTokens(m.context)}</span> : null}
                  {m.cost?.input != null ? <span className="hidden shrink-0 font-mono text-[10px] text-faint md:block">${m.cost.input}/{m.cost.output ?? '?'}</span> : null}
                  {s.activeProvider === p.id && s.activeModel === m.id && <Check size={13} className="shrink-0 text-accent" />}
                </button>
              ))}
              {expanded && models.length > MAX_MODELS && !showAll && <button onClick={() => setMore(new Set(more).add(p.id))} className="w-full px-2.5 py-1 text-left text-[11px] text-accent">Show all {models.length} models…</button>}
              {expanded && p.compat !== 'requires-proxy' && models.length === 0 && <p className="px-2.5 pb-2 text-[11px] text-muted">{lv?.status === 'loading' ? 'Fetching live models…' : 'No models yet — add a key or a custom model ID in All providers…'}</p>}
            </div>
          )
        })}
        {groups.length > MAX_GROUPS && <p className="px-3 py-2 text-center text-[11px] text-muted">Showing {MAX_GROUPS} of {groups.length} providers — refine your search.</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-line p-1">
        <button onClick={() => { close(); useApp.getState().setOnboardingOpen(true) }} className="rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg">Quick setup…</button>
        <button onClick={() => { close(); useApp.getState().openSettings('providers') }} className="rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg">All providers…</button>
        <button onClick={() => void useModels.getState().loadRegistry(true)} title="Refresh the model catalog" aria-label="Refresh Catalog" className="ml-auto flex min-w-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-faint transition-colors hover:bg-subtle hover:text-fg">
          <RefreshCw size={11} className={cn('shrink-0', status === 'loading' && 'animate-spin-fast')} /><span className="truncate">{syncedAt ? `synced ${ago(syncedAt)}` : 'Refresh Catalog'}</span>
        </button>
      </div>
    </div>
  )
}
