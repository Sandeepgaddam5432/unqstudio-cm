import { useState } from 'react'
import { Check, ExternalLink, Lock } from 'lucide-react'
import { Badge, Button, Input, Label, Spinner } from '@/ui/primitives'
import { SERVICES, connSecretName, getConn, isConnected, type ServiceDef } from '@/store/connections'
import { useVault } from '@/store/vault'
import { verifyConnection, type VerifyResult } from '@/core/deploy/verify'
import { toast } from '@/store/toast'

function ServiceCard({ def }: { def: ServiceDef }) {
  const vault = useVault()
  const saved = getConn(def.id)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<VerifyResult | null>(null)
  const merged = { ...saved, ...Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim())) }
  const connected = isConnected(def.id)

  const save = async () => {
    if (vault.locked) return vault.setUnlockOpen(true)
    for (const f of def.fields) if (vals[f.key]?.trim()) await vault.setSecret(connSecretName(def.id, f.key), vals[f.key].trim())
    setVals({})
    toast.success(`${def.name} saved`)
  }
  const test = async () => { setBusy(true); setRes(await verifyConnection(def.id, merged)); setBusy(false) }
  const remove = async () => { for (const f of def.fields) if (saved[f.key]) await vault.removeSecret(connSecretName(def.id, f.key)); setRes(null); toast.info(`${def.name} disconnected`) }

  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">{def.name}{connected ? <Badge tone="success"><Check size={9} />connected</Badge> : <Badge>not connected</Badge>}</p>
          <p className="mt-0.5 text-xs text-muted">{def.blurb}</p>
        </div>
        <a href={def.help} target="_blank" rel="noreferrer noopener" className="inline-flex shrink-0 items-center gap-1 text-xs text-accent">Create token <ExternalLink size={10} /></a>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {def.fields.map((f) => (
          <div key={f.key}>
            <Label hint={f.optional ? 'optional' : undefined}>{f.label}</Label>
            <Input type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} placeholder={saved[f.key] ? (f.secret ? '•••••••• (saved)' : saved[f.key]) : f.placeholder} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {vault.locked && <Button size="sm" onClick={() => vault.setUnlockOpen(true)}><Lock size={12} />Unlock vault</Button>}
        <Button size="sm" variant="primary" onClick={save} disabled={!Object.values(vals).some((v) => v.trim())}>Save</Button>
        <Button size="sm" onClick={test} disabled={busy || !Object.keys(merged).length}>{busy && <Spinner size={12} />}Test</Button>
        {connected && <Button size="sm" variant="ghost" onClick={remove}>Disconnect</Button>}
      </div>
      {res && <p className={`mt-3 rounded-lg border px-3 py-2 text-xs ${res.ok ? 'border-success/30 bg-success/5 text-success' : 'border-danger/30 bg-danger/5 text-danger'}`}>{res.message}</p>}
    </div>
  )
}

export function ConnectionsTab() {
  useVault((v) => v.rev)
  return (
    <div className="space-y-4 p-5">
      <p className="text-xs text-muted">Tokens are stored in your local key vault and are used only for direct browser → service API calls when you publish. Use fine-grained tokens with the minimum scopes.</p>
      {SERVICES.map((s) => <ServiceCard key={s.id} def={s} />)}
    </div>
  )
}
