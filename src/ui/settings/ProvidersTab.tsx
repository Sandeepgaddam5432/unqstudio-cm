import { useState } from 'react'
import { ChevronRight, Lock, ShieldCheck, Unlock } from 'lucide-react'
import { Badge, Button, Input, Section, Switch } from '@/ui/primitives'
import { ProviderKeyForm } from '@/ui/ai/ProviderKeyForm'
import { allProviders } from '@/store/aiConfig'
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

export function ProvidersTab() {
  const s = useSettings()
  useVault((x) => x.rev)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="p-5">
      <VaultCard />
      <Section title="LLM providers" description="Direct-from-browser BYOK. Enable the ones you use; the model picker lists enabled providers only.">
        <div className="divide-y divide-line rounded-2xl border border-line">
          {allProviders().map((p) => {
            const has = !!getSecret(providerSecretName(p.id)) || !!p.noKey
            const enabled = s.enabled[p.id] !== false
            return (
              <div key={p.id}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <button onClick={() => setOpen(open === p.id ? null : p.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open === p.id}>
                    <ChevronRight size={14} className={cn('shrink-0 text-faint transition-transform', open === p.id && 'rotate-90')} />
                    <span className="truncate text-[13px] font-medium">{p.name}</span>
                    {has && !p.noKey && <Badge tone="success">key</Badge>}
                    {p.local && <Badge>local</Badge>}
                    {p.freeTier && <Badge tone="accent" className="hidden sm:inline-flex">free tier</Badge>}
                    {s.activeProvider === p.id && <Badge tone="accent">active</Badge>}
                  </button>
                  <Switch checked={enabled} onChange={(v) => s.set({ enabled: { ...s.enabled, [p.id]: v } })} label={`Enable ${p.name}`} />
                </div>
                {open === p.id && <div className="animate-fade border-t border-line bg-subtle/40 p-4"><ProviderKeyForm provider={p} /></div>}
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
