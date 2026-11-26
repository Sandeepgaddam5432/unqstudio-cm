import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Brain, Check, Eye, Plus, RefreshCw, Search, Star, Wrench } from 'lucide-react'
import { allProviders, configFor, fetchLiveFor, isConfigured, isProviderEnabled, modelsForProvider } from '@/store/aiConfig'
import { useModels } from '@/store/models'
import { useSettings } from '@/store/settings'
import { useApp } from '@/store/app'
import { useVault } from '@/store/vault'
import { modelKey, useModelPrefs } from '@/store/modelPrefs'
import { useCustomProviders } from '@/store/customProviders'
import { matchesQuery, scoreModel } from '@/core/ai/modelSearch'
import type { EnrichedModel } from '@/core/ai/modelFetcher'
import type { ProviderDef } from '@/core/ai/providers'
import { Spinner } from '@/ui/primitives'
import { ModelIcon } from '@/ui/icons/ModelIcon'
import { ProviderIcon } from '@/ui/icons/ProviderIcon'
import { formatTokens } from '@/core/ai/tokens'
import { cn } from '@/lib/cn'
import { ago } from '@/ui/settings/registryUi'
import { NAV_KEYS, moveActive, scrollTopFor, selectableRows, type NavKey } from './pickerNav'

export type PickerTab = 'configured' | 'favorites' | 'ready' | 'custom' | 'local' | 'all'
const TABS: { id: PickerTab; label: string }[] = [
  { id: 'configured', label: 'Configured' }, { id: 'favorites', label: 'Favorites ⭐' }, { id: 'ready', label: 'Browser-Ready' },
  { id: 'custom', label: 'Custom' }, { id: 'local', label: 'Local' }, { id: 'all', label: 'All Providers' },
]
const ROW_H = 36
const OVERSCAN = 8
const MAX_SEARCH = 300

type Row =
  | { t: 'section'; key: string; label: string }
  | { t: 'head'; key: string; p: ProviderDef; open: boolean; total: number }
  | { t: 'model'; key: string; p: ProviderDef; m: EnrichedModel; sub?: boolean }
  | { t: 'skeleton'; key: string }
  | { t: 'note'; key: string; text: string }

const Chip = ({ children, title }: { children: React.ReactNode; title?: string }) => <span title={title} className="hidden shrink-0 rounded bg-subtle px-1 font-mono text-[10px] leading-4 text-muted sm:inline-block">{children}</span>

/**
 * Model picker body (anchored popover on desktop, bottom sheet on mobile).
 * Sticky fuzzy search (names, providers, capability keywords) + filter pills; favorites/recents pinned on top;
 * one WINDOWED flat row list so 300+ providers / 9,000+ models scroll at 60fps with a handful of DOM nodes.
 */
export function ModelPicker({ close }: { close: () => void }) {
  const s = useSettings()
  useVault((v) => v.rev)
  const registry = useModels((m) => m.registry)
  const live = useModels((m) => m.live)
  const syncedAt = useModels((m) => m.syncedAt)
  const status = useModels((m) => m.registryStatus)
  const favorites = useModelPrefs((p) => p.favorites)
  const recents = useModelPrefs((p) => p.recents)
  const customCount = useCustomProviders((c) => c.providers)
  const providers = allProviders()
  const configuredList = providers.filter((p) => isProviderEnabled(p) && isConfigured(p))
  const [tab, setTab] = useState<PickerTab>(configuredList.length ? 'configured' : 'ready')
  const [q, setQ] = useState('')
  const dq = useDeferredValue(q)
  const [open, setOpen] = useState<Set<string>>(() => new Set([s.activeProvider]))

  // Auto-fetch the live model list for configured providers that have not been queried yet.
  useEffect(() => { for (const p of configuredList) { const st = live[p.id]?.status; if (!st || st === 'idle') void fetchLiveFor(p) } }, [])

  const rows = useMemo<Row[]>(() => {
    const query = dq.trim()
    const byId = new Map(providers.map((p) => [p.id, p]))
    const modelRow = (p: ProviderDef, m: EnrichedModel, sub?: boolean): Row => ({ t: 'model', key: `${sub ? 's:' : ''}${p.id}::${m.id}`, p, m, sub })
    const lookup = (k: string): Row | null => {
      const [pid, ...rest] = k.split('::'); const mid = rest.join('::'); const p = byId.get(pid!)
      if (!p) return null
      const m = modelsForProvider(p).find((x) => x.id === mid) ?? { id: mid, name: mid, source: 'custom' as const }
      return modelRow(p, m, true)
    }
    const pool = providers.filter((p) => {
      if (tab === 'configured') return isProviderEnabled(p) && isConfigured(p)
      if (tab === 'ready') return p.compat === 'browser-ready'
      if (tab === 'custom') return !!p.custom
      if (tab === 'local') return p.compat === 'local'
      return true
    })
    const out: Row[] = []
    if (tab === 'favorites' || (!query && tab === 'configured')) {
      const favRows = favorites.map(lookup).filter((r): r is Row => !!r)
      if (favRows.length) { out.push({ t: 'section', key: 'sec-fav', label: 'Favorites' }, ...favRows) }
      if (tab === 'configured') {
        const rec = recents.filter((k) => !favorites.includes(k)).map(lookup).filter((r): r is Row => !!r)
        if (rec.length) out.push({ t: 'section', key: 'sec-rec', label: 'Recently used' }, ...rec)
      }
      if (tab === 'favorites') {
        const f = query ? favRows.filter((r) => r.t === 'model' && matchesQuery(r.m, r.p.name, query)) : favRows
        return f.length ? [{ t: 'section', key: 'sec-fav', label: 'Favorites' }, ...f] : [{ t: 'note', key: 'nofav', text: query ? `No favorites match “${query}”.` : 'Star ⭐ any model to pin it here.' }]
      }
    }
    if (query) {
      const hits: { p: ProviderDef; m: EnrichedModel; sc: number }[] = []
      for (const p of pool) {
        if (p.compat === 'requires-proxy') continue
        for (const m of modelsForProvider(p)) if (matchesQuery(m, p.name, query)) hits.push({ p, m, sc: scoreModel(m, query) })
      }
      hits.sort((a, b) => a.sc - b.sc)
      if (!hits.length) return [{ t: 'note', key: 'none', text: `No models match “${query}”.` }]
      out.push({ t: 'section', key: 'sec-res', label: `${hits.length} result${hits.length === 1 ? '' : 's'}${hits.length > MAX_SEARCH ? ` (showing ${MAX_SEARCH})` : ''}` })
      for (const h of hits.slice(0, MAX_SEARCH)) out.push(modelRow(h.p, h.m))
      return out
    }
    if (!pool.length) out.push({ t: 'note', key: 'empty', text: tab === 'configured' ? 'No configured providers yet. Add an API key in Providers Hub, or browse Browser-Ready.' : tab === 'custom' ? 'No custom providers yet — add one below.' : 'Nothing here.' })
    for (const p of pool) {
      const isOpen = open.has(p.id)
      const ms = isOpen && p.compat !== 'requires-proxy' ? modelsForProvider(p) : []
      out.push({ t: 'head', key: `h:${p.id}`, p, open: isOpen, total: ms.length })
      if (!isOpen) continue
      if (p.compat === 'requires-proxy') out.push({ t: 'note', key: `n:${p.id}`, text: 'Needs server-side credentials (IAM / signed requests) — route it through a gateway such as OpenRouter or your own proxy.' })
      else if (live[p.id]?.status === 'loading' && !ms.length) out.push({ t: 'skeleton', key: `k1:${p.id}` }, { t: 'skeleton', key: `k2:${p.id}` }, { t: 'skeleton', key: `k3:${p.id}` })
      else if (!ms.length) out.push({ t: 'note', key: `n:${p.id}`, text: 'No models yet — add a key or a model ID in Providers Hub.' })
      else for (const m of ms) out.push(modelRow(p, m))
    }
    return out
  }, [tab, dq, open, registry, live, s.userModels, s.enabled, providers.length, favorites, recents, customCount])

  // ── windowing ──
  const scroller = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(0)
  const [vh, setVh] = useState(420)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setVh(el.clientHeight || 420)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { scroller.current?.scrollTo?.({ top: 0 }); setTop(0) }, [tab, dq])
  const first = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN)
  const last = Math.min(rows.length, Math.ceil((top + vh) / ROW_H) + OVERSCAN)

  // ── keyboard navigation (ArrowUp/Down, Home/End, Enter, Escape) ──
  const [activeIdx, setActiveIdx] = useState(-1)
  useEffect(() => { setActiveIdx(-1) }, [tab, dq])
  const onNavKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return }
    if ((NAV_KEYS as string[]).includes(e.key)) {
      e.preventDefault()
      const next = moveActive(selectableRows(rows), activeIdx, e.key as NavKey)
      setActiveIdx(next)
      const el = scroller.current
      if (el && next >= 0) { const t = scrollTopFor(next, ROW_H, el.scrollTop, el.clientHeight || vh); if (t !== el.scrollTop) { el.scrollTop = t; setTop(t) } }
      return
    }
    if (e.key === 'Enter') {
      const r = rows[activeIdx] ?? rows[selectableRows(rows).find((i) => rows[i]!.t === 'model') ?? -1]
      if (!r) return
      e.preventDefault()
      if (r.t === 'model') pick(r.p.id, r.m.id)
      else if (r.t === 'head') toggle(r.p.id)
    }
  }
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const pick = (providerId: string, id: string) => {
    const c = configFor(providerId)
    s.set({ activeProvider: providerId, activeModel: id, enabled: { ...s.enabled, [providerId]: true } })
    useModelPrefs.getState().pushRecent(providerId, id)
    close()
    if (c.error === 'nokey') useApp.getState().openSettings('providers')
  }

  const renderRow = (r: Row, idx: number) => {
    const style: React.CSSProperties = { position: 'absolute', top: 0, left: 0, right: 0, height: ROW_H, transform: `translateY(${idx * ROW_H}px)` }
    if (r.t === 'section') return <div key={r.key} style={style} className="flex items-end px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">{r.label}</div>
    if (r.t === 'note') return <div key={r.key} style={style} className="flex items-center px-3 text-[11px] leading-snug text-muted"><span className="line-clamp-2">{r.text}</span></div>
    if (r.t === 'skeleton') return <div key={r.key} style={style} className="flex items-center gap-2 px-3" aria-hidden="true"><span className="h-4 w-4 animate-pulse rounded bg-subtle" /><span className="h-3 flex-1 animate-pulse rounded bg-subtle" /><span className="h-3 w-10 animate-pulse rounded bg-subtle" /></div>
    if (r.t === 'head') {
      const { p } = r
      const lv = live[p.id]
      return (
        <button key={r.key} style={style} onClick={() => toggle(p.id)} aria-expanded={r.open} id={`mp-row-${idx}`} data-active={idx === activeIdx || undefined} data-provider-group={p.id} className={cn('flex items-center gap-2 rounded-lg px-2.5 text-left transition-colors duration-150 hover:bg-subtle', idx === activeIdx && 'bg-subtle ring-2 ring-accent/60')}>
          <ProviderIcon id={p.id} name={p.name} logo={p.logo} brand={p.brand} accent={p.accent} size={16} />
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-tight">{p.name}</span>
          {lv?.status === 'loading' && <Spinner size={11} />}
          {lv?.status === 'ok' && <span className="shrink-0 rounded bg-success/10 px-1 text-[9px] font-medium text-success">live</span>}
          {p.compat === 'requires-proxy' && <span className="shrink-0 text-[10px] text-warn">Requires Proxy</span>}
          {p.compat !== 'requires-proxy' && !isConfigured(p) && <span className="shrink-0 text-[10px] text-warn">needs key</span>}
        </button>
      )
    }
    const { p, m } = r
    const fav = favorites.includes(modelKey(p.id, m.id))
    const active = s.activeProvider === p.id && s.activeModel === m.id
    return (
      <div key={r.key} style={style} role="option" aria-selected={active} tabIndex={0} title={`${p.name} · ${m.id}`} id={`mp-row-${idx}`} data-active={idx === activeIdx || undefined} data-model-row={`${p.id}::${m.id}`}
        onClick={() => pick(p.id, m.id)} onKeyDown={(e) => { if (e.key === 'Enter') pick(p.id, m.id) }}
        className={cn('group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors duration-150 hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none', idx === activeIdx && 'bg-subtle ring-2 ring-accent/60')}>
        <ModelIcon modelId={m.id} modelName={m.name} providerId={p.id} providerName={p.name} providerLogo={p.logo} brand={p.brand} accent={p.accent} size={16} />
        <span className="min-w-[5rem] flex-1 truncate">{m.name}</span>
        <span className="hidden shrink-0 items-center gap-1 text-faint md:flex" title={p.name}><ProviderIcon id={p.id} name={p.name} logo={p.logo} brand={p.brand} accent={p.accent} size={11} /></span>
        {m.context ? <Chip title="Context window">{formatTokens(m.context)}</Chip> : null}
        {(m.vision || m.reasoning || m.tool_call) && (
          <span className="flex shrink-0 items-center gap-0.5 text-faint">
            {m.vision && <span title="Vision" className="rounded bg-subtle p-0.5"><Eye size={11} aria-label="Vision" /></span>}
            {m.reasoning && <span title="Reasoning" className="rounded bg-subtle p-0.5"><Brain size={11} aria-label="Reasoning" /></span>}
            {m.tool_call && <span title="Tools" className="rounded bg-subtle p-0.5"><Wrench size={11} aria-label="Tools" /></span>}
          </span>
        )}
        {m.cost?.input != null ? <Chip title="USD per 1M tokens in/out">${m.cost.input}/{m.cost.output ?? '?'}</Chip> : null}
        {active && <Check size={13} className="shrink-0 text-accent" />}
        <button aria-label={fav ? `Unstar ${m.name}` : `Star ${m.name}`} aria-pressed={fav} data-star onClick={(e) => { e.stopPropagation(); useModelPrefs.getState().toggleFavorite(p.id, m.id) }} className={cn('shrink-0 rounded p-0.5 transition-opacity duration-150 hover:text-warn', fav ? 'text-warn' : 'text-faint opacity-60 group-hover:opacity-100')}>
          <Star size={12} fill={fav ? 'currentColor' : 'none'} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-model-picker>
      <div className="sticky top-0 z-10 shrink-0 space-y-2 bg-panel p-2 pb-1.5">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-subtle px-2.5 text-muted focus-within:border-line-strong focus-within:ring-2 focus-within:ring-accent/20">
          <Search size={14} className="shrink-0" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onNavKey} role="combobox" aria-expanded="true" aria-controls="mp-list" aria-autocomplete="list" aria-activedescendant={activeIdx >= 0 ? `mp-row-${activeIdx}` : undefined} placeholder="Search models, providers, vision, reasoning, free…" aria-label="Search models" className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint" />
        </label>
        <div className="scrollbar-none -mx-0.5 flex gap-1 overflow-x-auto px-0.5" role="tablist" aria-label="Provider filter">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn('h-6 shrink-0 rounded-full border px-2.5 text-[11px] font-medium transition-colors duration-150', tab === t.id ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg')}>{t.label}</button>
          ))}
        </div>
      </div>
      <div ref={scroller} onScroll={(e) => setTop(e.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-1 pb-1" id="mp-list" data-picker-list role="listbox" aria-label="Models">
        <div className="relative" style={{ height: rows.length * ROW_H }}>
          {rows.slice(first, last).map((r, i) => renderRow(r, first + i))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-line p-1">
        <button onClick={() => { close(); useCustomProviders.getState().openNew() }} data-testid="picker-add-custom" className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10"><Plus size={12} />Add Custom Provider</button>
        <button onClick={() => { close(); useApp.getState().openSettings('providers') }} className="rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:bg-subtle hover:text-fg">Providers Hub…</button>
        <button onClick={() => void useModels.getState().loadRegistry(true)} title="Refresh the model catalog" aria-label="Refresh Catalog" className="ml-auto flex min-w-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-faint transition-colors hover:bg-subtle hover:text-fg">
          <RefreshCw size={11} className={cn('shrink-0', status === 'loading' && 'animate-spin-fast')} /><span className="truncate">{syncedAt ? `Catalog synced ${ago(syncedAt)}` : 'Refresh Catalog'}</span>
        </button>
      </div>
    </div>
  )
}
