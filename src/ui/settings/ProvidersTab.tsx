import { CustomProviderCards } from '@/ui/ai/CustomProviderCards'
import { ProviderIcon } from '@/ui/icons/ProviderIcon'
import { useState } from 'react'
import { ChevronRight, Lock, Plus, ShieldCheck, Unlock } from 'lucide-react'
import { Badge, Button, Input, Section, Switch } from '@/ui/primitives'
import { ProviderKeyForm } from '@/ui/ai/ProviderKeyForm'
import { allProviders, isConfigured, isProviderEnabled } from '@/store/aiConfig'
import { RegistryCard } from './registryUi'
import { useSettings } from '@/store/settings'
import { useVault, getSecret, providerSecretName } from '@/store/vault'
import { toast } from '@/store/toast'
import { useCustomProviders } from '@/store/customProviders'
import { cn } from '@/lib/cn'

function VaultCard() {
  const v = useVault()
  const [pass, setPass] = useState('')
  return (
    <div className="mb-6 rounded-2xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 text-muted" />
          <div>
            <p className="text-sm font-medium">Key vault <Badge tone={v.encrypted ? 'success' : 'warn'} className="ml-1">{v.encrypted ? (v.locked ? 'encrypted · locked' : 'encrypted · unlocked') : 'not encrypted'}</Badge></p>
            <p className="mt-0.5 text-xs text-muted">Keys live in IndexedDB on this device only. Add a passphrase to encrypt them (PBKDF2 → AES-GCM-256).</p>
          </div>
        </div>
        {v.encrypted && !v.locked && <Button size="sm" onClick={() => v.lock()}><Lock size={13} />Lock now</Button>}
        {v.locked && <Button size="sm" variant="primary" onClick={() => v.setUnlockOpen(true)}><Unlock size={13} />Unlock</Button>}
      </div>
      {!v.encrypted && (
        <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); try { await v.enable(pass); setPass(''); toast.success('Vault encrypted') } catch (err) { toast.error('Could not encrypt', String(err)) } }}>
          <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="New passphrase (min 6 characters)" className="h-8 text-xs" />
          <Button size="sm" variant="primary" type="submit" disabled={pass.length < 6}>Encrypt</Button>
        </form>
      )}
      {v.encrypted && !v.locked && <Button size="sm" variant="ghost" className="mt-2" onClick={async () => { await v.disable(); toast.info('Passphrase removed – keys stored unencrypted') }}>Remove passphrase</Button>}
    </div>
  )
}

type Filter = 'ready' | 'local' | 'proxy' | 'all'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ready', label: 'Browser-Ready' }, { id: 'local', label: 'Local' }, { id: 'proxy', label: 'Requires Proxy' }, { id: 'all', label: 'All Providers' },
]
const FEATURED = ['openai', 'anthropic', 'gemini', 'openrouter', 'groq', 'deepseek', 'xai', 'mistral', 'together', 'fireworks', 'cerebras', 'moonshot']
const compatBadge = (c?: string) => c === 'local' ? <Badge>local</Badge> : c === 'requires-proxy' ? <Badge tone="warn">proxy</Badge> : <Badge tone="success" className="hidden sm:inline-flex">browser</Badge>
type Def = ReturnType<typeof allProviders>[number]

function ProviderRow({ p }: { p: Def }) {
  const s = useSettings()
  const [open, setOpen] = useState(false)
  const has = !!getSecret(providerSecretName(p.id)) || !!p.noKey
  const enabled = isProviderEnabled(p)
  return (
    <div data-provider-row={p.id}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <ChevronRight size={14} className={cn('shrink-0 text-faint transition-transform', open && 'rotate-90')} />
          <ProviderIcon id={p.id} name={p.name} logo={p.logo} brand={p.brand} accent={p.accent} size={16} />
          <span className="truncate text-[13px] font-medium">{p.name}</span>
          {has && !p.noKey && <Badge tone="success">key</Badge>}
          {compatBadge(p.compat)}
          {p.freeTier && <Badge tone="accent" className="hidden md:inline-flex">free tier</Badge>}
          {s.activeProvider === p.id && <Badge tone="accent">active</Badge>}
        </button>
        <Switch checked={enabled} disabled={p.compat === 'requires-proxy'} onChange={(v) => s.set({ enabled: { ...s.enabled, [p.id]: v } })} label={`Enable ${p.name}`} />
      </div>
      {open && <div className="animate-fade border-t border-line bg-subtle/40 p-4"><ProviderKeyForm provider={p} /></div>}
    </div>
  )
}

function Group({ title, description, list, empty, limit = 60 }: { title: string; description?: string; list: Def[]; empty?: string; limit?: number }) {
  return (
    <Section title={title} description={description} right={<Badge>{list.length}</Badge>}>
      <div className="divide-y divide-line rounded-2xl border border-line" data-provider-section={title}>
        {list.length === 0 && <p className="px-3 py-5 text-center text-xs text-muted">{empty ?? 'Nothing here yet.'}</p>}
        {list.slice(0, limit).map((p) => <ProviderRow key={p.id} p={p} />)}
      </div>
      {list.length > limit && <p className="mt-2 text-center text-xs text-muted">Showing {limit} of {list.length}.</p>}
    </Section>
  )
}

/** Providers Hub: Add Custom Provider → vault → catalog status → Configured & Active · Popular Cloud · Custom · Local AI · All Providers. */
export function ProvidersTab() {
  useVault((x) => x.rev)
  const openNew = useCustomProviders((c) => c.openNew)
  const [filter, setFilter] = useState<Filter>('ready')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(120)
  const all = allProviders()
  const configured = all.filter((p) => isConfigured(p))
  const popular = FEATURED.map((id) => all.find((p) => p.id === id)).filter((p): p is Def => !!p && !configured.includes(p))
  const local = all.filter((p) => p.compat === 'local' && !p.custom)
  const matches = (p: Def) => filter === 'ready' ? p.compat === 'browser-ready' : filter === 'local' ? p.compat === 'local' : filter === 'proxy' ? p.compat === 'requires-proxy' : true
  const list = all.filter((p) => matches(p) && (!q.trim() || p.name.toLowerCase().includes(q.toLowerCase()) || p.id.includes(q.toLowerCase())))
  return (
    <div className="p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-3">
        <div className="min-w-0"><p className="text-[13px] font-medium">Connect anything</p><p className="text-xs text-muted">OpenAI, Anthropic, Gemini or Ollama wire protocol — any base URL.</p></div>
        <Button variant="primary" onClick={openNew} data-testid="add-custom-provider"><Plus size={14} />Add Custom Provider</Button>
      </div>
      <VaultCard />
      <RegistryCard />
      <Group title="Configured & Active" description="Providers with a saved key (or enabled local runtime)." list={configured} empty="No providers configured yet — add a key to a popular provider below." />
      <Group title="Popular Cloud" description="One key and you're building." list={popular} />
      <Section title="Custom Providers" description="Your own endpoints and gateways."><CustomProviderCards showAdd={false} compact /></Section>
      <Group title="Local AI" description="Runs on your machine — no key needed. Allow browser origins (CORS)." list={local} />
      <Section title="All Providers" description={`Provider Directory · ${all.length} providers. Enter a key and the live model list is fetched automatically.`}>
        <div className="mb-3 space-y-2">
          <Input value={q} onChange={(e) => { setQ(e.target.value); setLimit(120) }} placeholder={`Search ${all.length} providers…`} aria-label="Search providers" className="h-8 text-xs" />
          <div className="scrollbar-none flex gap-1 overflow-x-auto" role="tablist" aria-label="Provider compatibility filter">
            {FILTERS.map((f) => <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => { setFilter(f.id); setLimit(120) }} className={cn('h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors duration-150', filter === f.id ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg')}>{f.label}</button>)}
          </div>
        </div>
        <div className="divide-y divide-line rounded-2xl border border-line">
          {list.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">No providers in this view.</p>}
          {list.slice(0, limit).map((p) => <ProviderRow key={p.id} p={p} />)}
        </div>
        {list.length > limit && <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setLimit(limit + 200)}>Show more ({list.length - limit} left)</Button>}
      </Section>
    </div>
  )
}
