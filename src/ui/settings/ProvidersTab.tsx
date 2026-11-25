import { useState } from 'react'
import { ChevronRight, Lock, ShieldCheck, Unlock } from 'lucide-react'
import { Badge, Button, Input, Section, Switch } from '@/ui/primitives'
import { ProviderKeyForm } from '@/ui/ai/ProviderKeyForm'
import { allProviders, isConfigured, isProviderEnabled } from '@/store/aiConfig'
import { RegistryCard } from './registryUi'
import { useSettings } from '@/store/settings'
import { useVault, getSecret, providerSecretName } from '@/store/vault'
import { toast } from '@/store/toast'
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

type Filter = 'configured' | 'ready' | 'local' | 'proxy' | 'all'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'configured', label: 'Configured ⭐' }, { id: 'ready', label: 'Browser-Ready 🟢' }, { id: 'local', label: 'Local 💻' }, { id: 'proxy', label: 'Requires Proxy 🔌' }, { id: 'all', label: 'All (models.dev)' },
]
const compatBadge = (c?: string) => c === 'local' ? <Badge>local 💻</Badge> : c === 'requires-proxy' ? <Badge tone="warn">proxy 🔌</Badge> : <Badge tone="success" className="hidden sm:inline-flex">browser 🟢</Badge>

export function ProvidersTab() {
  const s = useSettings()
  useVault((x) => x.rev)
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('ready')
  const [q, setQ] = useState('')
  const all = allProviders()
  const matches = (p: (typeof all)[number]) => filter === 'configured' ? isConfigured(p) : filter === 'ready' ? p.compat === 'browser-ready' : filter === 'local' ? p.compat === 'local' : filter === 'proxy' ? p.compat === 'requires-proxy' : true
  const list = all.filter((p) => matches(p) && (!q.trim() || p.name.toLowerCase().includes(q.toLowerCase()) || p.id.includes(q.toLowerCase())))
  return (
    <div className="p-5">
      <VaultCard />
      <RegistryCard />
      <Section title="LLM providers" description="Direct-from-browser BYOK. Enter a key and the live model list is fetched automatically. Providers discovered from models.dev work instantly through the universal OpenAI-compatible adapter.">
        <div className="mb-3 space-y-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${all.length} providers…`} aria-label="Search providers" className="h-8 text-xs" />
          <div className="scrollbar-none flex gap-1 overflow-x-auto" role="tablist" aria-label="Provider compatibility filter">
            {FILTERS.map((f) => <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={cn('h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors duration-150', filter === f.id ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg')}>{f.label}<span className="ml-1 text-faint">{all.filter((p) => (f.id === 'configured' ? isConfigured(p) : f.id === 'ready' ? p.compat === 'browser-ready' : f.id === 'local' ? p.compat === 'local' : f.id === 'proxy' ? p.compat === 'requires-proxy' : true)).length}</span></button>)}
          </div>
        </div>
        <div className="divide-y divide-line rounded-2xl border border-line">
          {list.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">No providers in this view.</p>}
          {list.slice(0, 120).map((p) => {
            const has = !!getSecret(providerSecretName(p.id)) || !!p.noKey
            const enabled = isProviderEnabled(p)
            return (
              <div key={p.id}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <button onClick={() => setOpen(open === p.id ? null : p.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open === p.id}>
                    <ChevronRight size={14} className={cn('shrink-0 text-faint transition-transform', open === p.id && 'rotate-90')} />
                    {p.logo && <img src={p.logo} alt="" loading="lazy" width={14} height={14} className="h-3.5 w-3.5 shrink-0 dark:invert" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
                    <span className="truncate text-[13px] font-medium">{p.name}</span>
                    {has && !p.noKey && <Badge tone="success">key</Badge>}
                    {compatBadge(p.compat)}
                    {p.freeTier && <Badge tone="accent" className="hidden md:inline-flex">free tier</Badge>}
                    {s.activeProvider === p.id && <Badge tone="accent">active</Badge>}
                  </button>
                  <Switch checked={enabled} disabled={p.compat === 'requires-proxy'} onChange={(v) => s.set({ enabled: { ...s.enabled, [p.id]: v } })} label={`Enable ${p.name}`} />
                </div>
                {open === p.id && <div className="animate-fade border-t border-line bg-subtle/40 p-4"><ProviderKeyForm provider={p} /></div>}
              </div>
            )
          })}
        </div>
        {list.length > 120 && <p className="mt-2 text-center text-xs text-muted">Showing 120 of {list.length} — use search to narrow.</p>}
      </Section>
    </div>
  )
}
