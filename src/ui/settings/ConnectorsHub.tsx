import { useState } from 'react'
import { ExternalLink, Plus, Search, Trash2 } from 'lucide-react'
import { Badge, Button, Input, Label, Modal, SelectSheet, Spinner, Switch } from '@/ui/primitives'
import { BrandGlyph } from '@/ui/icons/ProviderIcon'
import { isBrandKey } from '@/ui/icons/modelFamily'
import { CUSTOM_KINDS, testCustom, testExtra, validateCustom, type ConnectorDef, type CustomConnector, type CustomKind, type TestResult } from '@/core/connectors'
import { verifyConnection } from '@/core/deploy/verify'
import { SERVICES } from '@/store/connections'
import { connectorDefs, connectorValues, customSecret, isConnectorConnected, kindLabel, useConnectors } from '@/store/connectors'
import { useVault } from '@/store/vault'
import { useApp } from '@/store/app'
import { toast } from '@/store/toast'
import { cn } from '@/lib/cn'

type Cat = 'Home' | 'All connectors' | 'Enabled' | 'Build' | 'Deploy' | 'Data' | 'AI' | 'Services'
const PILLS: Cat[] = ['Home', 'All connectors', 'Enabled', 'Build', 'Deploy', 'Data', 'AI', 'Services']
const FEATURED = ['github', 'supabase', 'netlify', 'stripe', 'openai', 'vercel']

export function BrandTile({ brand, size = 22 }: { brand: string; size?: number }) {
  return <span data-brand-tile={brand} className="glass-field flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">{isBrandKey(brand) ? <BrandGlyph brand={brand} size={size} /> : <BrandGlyph brand="custom" size={size} />}</span>
}

function ConnectorCard({ def }: { def: ConnectorDef }) {
  useConnectors((s) => s.rev); useVault((v) => v.rev)
  const { save, disconnect, setEnabled, isEnabled } = useConnectors()
  const [open, setOpen] = useState(false)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<TestResult | null>(null)
  const connected = isConnectorConnected(def.id)
  const on = connected && isEnabled(def.id)
  const merged = { ...connectorValues(def.id), ...Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim())) }
  const test = async () => {
    setBusy(true)
    try { setRes(SERVICES.some((s) => s.id === def.id) ? await verifyConnection(def.id as never, merged) : await testExtra(def.id, merged)) } finally { setBusy(false) }
  }
  const doSave = async () => { if (await save(def.id, vals)) { setVals({}); setOpen(false); toast.success(`${def.name} connected`, 'Stored encrypted in your local Key Vault.') } }
  return (
    <div data-connector-card={def.id} data-connected={connected || undefined} className="glass flex flex-col gap-2.5 rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <BrandTile brand={def.brand} />
        <div className="min-w-0 flex-1"><p className="t-label font-medium">{def.name}</p><p className="t-meta text-fg-tertiary">{def.category}</p></div>
        {connected ? <Switch checked={on} onChange={(v) => setEnabled(def.id, v)} label={`${def.name} enabled`} /> : <Badge>Not connected</Badge>}
      </div>
      <p className="t-meta text-fg-secondary">{def.blurb}</p>
      {open && (
        <div className="space-y-2.5 rounded-xl border border-line p-3" data-connector-form>
          {def.fields.map((f) => (
            <div key={f.key}><Label hint={f.optional ? 'optional' : undefined}>{f.label}</Label>
              <Input type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} aria-label={`${def.name} ${f.label}`} value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} placeholder={connectorValues(def.id)[f.key] ? (f.secret ? '•••••••• (saved)' : connectorValues(def.id)[f.key]) : f.placeholder} /></div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={doSave} disabled={!Object.values(vals).some((v) => v.trim())} data-connector-save>Save</Button>
            <Button size="sm" onClick={test} disabled={busy || !Object.keys(merged).length}>{busy && <Spinner size={12} />}Test connection</Button>
            <a href={def.help} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex items-center gap-1 text-xs text-accent">Get key <ExternalLink size={10} /></a>
          </div>
          {res && <p role="status" className={cn('text-xs', res.ok ? 'text-success' : 'text-danger')}>{res.message}</p>}
        </div>
      )}
      <div className="mt-auto flex gap-2">
        <button data-connector-connect={def.id} onClick={() => setOpen((o) => !o)} className="press glass-field h-9 rounded-full px-4 text-[13px] font-medium">{open ? 'Close' : connected ? 'Manage' : 'Connect'}</button>
        {connected && open && <button onClick={() => void disconnect(def.id).then(() => { setRes(null); toast.info(`${def.name} disconnected`) })} className="press h-9 rounded-full px-3 text-[13px] text-danger hover:bg-danger/10">Disconnect</button>}
      </div>
    </div>
  )
}

function CustomCard({ c }: { c: CustomConnector }) {
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<TestResult | null>(null)
  const removeCustom = useConnectors((s) => s.removeCustom)
  const toggle = (v: boolean) => { useConnectors.setState({ custom: useConnectors.getState().custom.map((x) => (x.id === c.id ? { ...x, enabled: v } : x)) }); try { const s = useConnectors.getState(); localStorage.setItem('unq.connectors.v1', JSON.stringify({ custom: s.custom, disabled: s.disabled })) } catch { /* ignore */ } }
  return (
    <div data-connector-card={c.id} data-custom-connector className="glass flex flex-col gap-2.5 rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <BrandTile brand="custom" />
        <div className="min-w-0 flex-1"><p className="t-label truncate font-medium">{c.name}</p><p className="t-meta truncate text-fg-tertiary">{kindLabel(c.kind)} · {c.url}</p></div>
        <Switch checked={c.enabled} onChange={toggle} label={`${c.name} enabled`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={async () => { setBusy(true); setRes(await testCustom(c, customSecret(c.id))); setBusy(false) }} disabled={busy}>{busy && <Spinner size={12} />}Test connection</Button>
        <button aria-label={`Remove ${c.name}`} onClick={() => void removeCustom(c.id)} className="press ml-auto flex h-9 w-9 items-center justify-center rounded-full text-danger hover:bg-danger/10"><Trash2 size={15} /></button>
      </div>
      {res && <p role="status" className={cn('text-xs', res.ok ? 'text-success' : 'text-danger')}>{res.message}</p>}
    </div>
  )
}

function AddCustomModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addCustom = useConnectors((s) => s.addCustom)
  const [name, setName] = useState(''); const [kind, setKind] = useState<CustomKind>('rest'); const [url, setUrl] = useState('')
  const [header, setHeader] = useState('Authorization'); const [secret, setSecret] = useState(''); const [err, setErr] = useState('')
  const submit = async () => {
    const e = validateCustom({ name, url }); if (e) return setErr(e)
    const c = await addCustom({ name, kind, url, header, secret }); if (!c) return
    toast.success(`${c.name} added`); setName(''); setUrl(''); setSecret(''); setErr(''); onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Add custom connector" description="REST API, Webhook or Remote MCP server. Secrets are encrypted in the local Key Vault." size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void submit()} data-custom-save>Add connector</Button></>}>
      <div className="space-y-3" data-custom-form>
        <div><Label>Name</Label><Input aria-label="Connector name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My billing API" /></div>
        <div><Label>Type</Label><SelectSheet<CustomKind> aria-label="Connector type" title="Connector type" className="w-full" value={kind} onChange={setKind} options={CUSTOM_KINDS.map((k) => ({ value: k.value, label: k.label, hint: k.hint }))} /></div>
        <div><Label>Endpoint URL</Label><Input aria-label="Endpoint URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/v1" /></div>
        <div className="grid grid-cols-2 gap-2"><div><Label hint="optional">Auth header</Label><Input aria-label="Auth header name" value={header} onChange={(e) => setHeader(e.target.value)} /></div><div><Label hint="optional">Secret / token</Label><Input type="password" autoComplete="off" aria-label="Auth header value" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Bearer …" /></div></div>
        {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      </div>
    </Modal>
  )
}

/** Categorised, searchable connectors hub with official full-colour brand icons, real credential forms, test + enable toggles and unlimited custom connectors. */
export function ConnectorsHub() {
  const sheet = useApp((s) => s.sheet)
  const closeSheet = useApp((s) => s.closeSheet)
  useConnectors((s) => s.rev)
  const custom = useConnectors((s) => s.custom)
  const isEnabled = useConnectors((s) => s.isEnabled)
  const [cat, setCat] = useState<Cat>('Home')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const needle = q.trim().toLowerCase()
  const list = connectorDefs().filter((s) => {
    if (needle && !`${s.name} ${s.blurb} ${s.category}`.toLowerCase().includes(needle)) return false
    if (cat === 'Home') return FEATURED.includes(s.id)
    if (cat === 'Enabled') return isConnectorConnected(s.id) && isEnabled(s.id)
    if (cat === 'All connectors') return true
    return s.category === cat
  })
  const customs = custom.filter((c) => (!needle || `${c.name} ${c.url}`.toLowerCase().includes(needle)) && (cat === 'Home' || cat === 'All connectors' || (cat === 'Enabled' && c.enabled)))
  return (
    <>
      <Modal open={sheet === 'connectors'} onClose={closeSheet} title="Connectors" description="Connect build, deploy, data and AI services. Credentials stay encrypted on this device." size="lg">
        <div data-connectors-hub className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-quaternary" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search connectors" aria-label="Search connectors" className="pl-9" /></div>
            <button data-add-custom onClick={() => setAdding(true)} className="press flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-fg-primary px-4 text-[13px] font-medium text-base"><Plus size={14} />Add custom</button>
          </div>
          <div className="hide-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1" role="tablist" aria-label="Connector categories">
            {PILLS.map((c) => <button key={c} role="tab" aria-selected={cat === c} data-connector-pill={c} onClick={() => setCat(c)} className={cn('press h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium', cat === c ? 'bg-fg-primary text-base' : 'glass-field text-fg-secondary')}>{c}</button>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((s) => <ConnectorCard key={s.id} def={s} />)}
            {customs.map((c) => <CustomCard key={c.id} c={c} />)}
            {(cat === 'Home' || cat === 'All connectors') && !needle && (
              <button data-connector-card="custom" onClick={() => setAdding(true)} className="press flex flex-col items-start gap-2 rounded-2xl border border-dashed border-line-strong p-4 text-left">
                <div className="flex items-center gap-3"><BrandTile brand="custom" /><div><p className="t-label font-medium">Custom API / MCP</p><p className="t-meta text-fg-tertiary">REST · Webhook · Remote MCP</p></div></div>
                <p className="t-meta text-fg-secondary">Add unlimited custom connectors with encrypted credentials.</p>
              </button>
            )}
          </div>
          {list.length === 0 && customs.length === 0 && <p className="py-6 text-center text-sm text-fg-tertiary">No connectors match.</p>}
        </div>
      </Modal>
      <AddCustomModal open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
