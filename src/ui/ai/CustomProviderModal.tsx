import { useEffect, useRef, useState } from 'react'
import { Check, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Badge, ColorField, Button, Input, Label, Modal, Spinner } from '@/ui/primitives'
import { BrandGlyph } from '@/ui/icons/ProviderIcon'
import type { BrandKey } from '@/ui/icons/brandSvgs'
import { useCustomProviders } from '@/store/customProviders'
import { getSecret, useVault } from '@/store/vault'
import { useSettings } from '@/store/settings'
import { fetchLiveFor, resolveProvider } from '@/store/aiConfig'
import { fetchLiveModels, type EnrichedModel } from '@/core/ai/modelFetcher'
import { ACCENT_PRESETS, BRAND_PRESETS, PROTOCOLS, cleanHeaders, parseHeaders, protocolInfo, secretNames, validateCustomProvider } from '@/core/ai/customProviders'
import type { ProviderKind } from '@/core/ai/providers'
import { toast } from '@/store/toast'
import { normalizeBaseUrl, shouldProxyByDefault } from '@/services/llm/urls'
import { cn } from '@/lib/cn'

type Row = { k: string; v: string }
type Fetch = { status: 'idle' | 'loading' | 'ok' | 'error'; models: EnrichedModel[]; message?: string; ms?: number }

/** First-class “+ Add Custom Provider” studio: 4 wire protocols, vault-held key + headers, live “Test & Auto-Fetch Models”. */
export function CustomProviderModal() {
  const { modalOpen, editingId, providers, closeModal } = useCustomProviders()
  const editing = providers.find((p) => p.id === editingId) ?? null
  return modalOpen ? <Form key={editing?.id ?? 'new'} editing={editing} onClose={closeModal} /> : null
}

function Form({ editing, onClose }: { editing: ReturnType<typeof useCustomProviders.getState>['providers'][number] | null; onClose: () => void }) {
  const vault = useVault()
  const savedKey = editing ? getSecret(secretNames(editing.id).key) : undefined
  const [name, setName] = useState(editing?.name ?? '')
  const [kind, setKind] = useState<ProviderKind>(editing?.kind ?? 'openai')
  const [baseUrl, setBaseUrl] = useState(editing?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')
  const [noKey, setNoKey] = useState(editing?.noKey ?? false)
  const [brand, setBrand] = useState(editing?.brand ?? 'custom')
  const [accent, setAccent] = useState(editing?.accent ?? ACCENT_PRESETS[0])
  const [browserAccess, setBrowserAccess] = useState(editing?.browserAccess ?? true)
  const [rows, setRows] = useState<Row[]>(() => {
    const h = editing ? parseHeaders(getSecret(secretNames(editing.id).headers)) : {}
    return Object.entries(h).map(([k, v]) => ({ k, v }))
  })
  const [viaProxy, setViaProxy] = useState(editing?.viaProxy ?? shouldProxyByDefault(editing?.baseUrl ?? ''))
  const proxyTouched = useRef(editing?.viaProxy !== undefined)
  const [models, setModels] = useState<string[]>(editing?.models ?? [])
  const [modelInput, setModelInput] = useState('')
  const [fetched, setFetched] = useState<Fetch>({ status: 'idle', models: [] })
  const info = protocolInfo(kind)

  useEffect(() => { setFetched({ status: 'idle', models: [] }) }, [kind])
  // Default: ON for non-local https endpoints, OFF for localhost — until the user flips the switch themselves.
  useEffect(() => { if (!proxyTouched.current) setViaProxy(shouldProxyByDefault(baseUrl)) }, [baseUrl])

  const testFetch = async () => {
    const err = validateCustomProvider({ name: name || 'x', baseUrl, kind })
    if (err) return setFetched({ status: 'error', models: [], message: err })
    setFetched({ status: 'loading', models: [] })
    const out = await fetchLiveModels({ provider: { id: editing?.id ?? 'custom:test', kind, baseUrl: baseUrl.trim(), headers: cleanHeaders(rows), browserAccess, noKey, viaProxy }, apiKey: apiKey.trim() || savedKey, baseUrl: baseUrl.trim() })
    if (out.ok && out.resolvedBase && out.resolvedBase !== normalizeBaseUrl(baseUrl)) { setBaseUrl(out.resolvedBase); toast.info('Base URL adjusted', `Models answered at ${out.resolvedBase}/models — saved that as the Base URL.`) }
    setFetched(out.ok ? { status: 'ok', models: out.models, ms: out.ms } : { status: 'error', models: [], message: out.error, ms: out.ms })
  }

  const addModel = () => { const v = modelInput.trim(); if (v && !models.includes(v)) setModels([...models, v]); setModelInput('') }

  const save = async () => {
    const err = validateCustomProvider({ name, baseUrl, kind })
    if (err) return toast.error('Check the form', err)
    if (vault.locked) return vault.setUnlockOpen(true)
    const headers = cleanHeaders(rows)
    const store = useCustomProviders.getState()
    const draft = { name: name.trim(), kind, baseUrl: normalizeBaseUrl(baseUrl), brand, accent, models, noKey, browserAccess, viaProxy, headerNames: Object.keys(headers) }
    try {
      const rec = editing ? (store.update(editing.id, draft), { ...editing, ...draft }) : store.add(draft)
      const sn = secretNames(rec.id)
      if (apiKey.trim()) await vault.setSecret(sn.key, apiKey.trim())
      if (Object.keys(headers).length) await vault.setSecret(sn.headers, JSON.stringify(headers)); else if (getSecret(sn.headers)) await vault.removeSecret(sn.headers)
      const st = useSettings.getState()
      st.set({ enabled: { ...st.enabled, [rec.id]: true } })
      const def = resolveProvider(rec.id)
      if (def) void fetchLiveFor(def)
      toast.success(`${rec.name} ${editing ? 'updated' : 'added'}`, 'Your key is encrypted in the Vault.')
      onClose()
    } catch (e) { toast.error('Could not save', String(e)) }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={editing ? `Edit ${editing.name}` : 'Add Custom Provider'}
      description="Connect any AI endpoint: pick its wire protocol, then test & auto-fetch its models."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()} data-testid="cp-save">{editing ? 'Save changes' : 'Add provider'}</Button></>}>
      <div className="space-y-4" data-testid="custom-provider-modal">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div><Label>Provider name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Gateway" aria-label="Provider name" data-testid="cp-name" /></div>
          <div className="min-w-0">
            <Label>Icon & accent</Label>
            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Icon preset">
              {BRAND_PRESETS.map((b) => (
                <button key={b} role="radio" aria-checked={brand === b} aria-label={`Icon ${b}`} onClick={() => setBrand(b)} className={cn('flex h-7 w-7 items-center justify-center rounded-md border transition-colors duration-150', brand === b ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong')}>
                  <BrandGlyph brand={b as BrandKey} size={15} accent={brand === b ? accent : undefined} />
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              {ACCENT_PRESETS.map((c) => <button key={c} aria-label={`Accent ${c}`} onClick={() => setAccent(c)} className={cn('h-4 w-4 rounded-full border', accent === c ? 'ring-2 ring-fg/40 ring-offset-1 ring-offset-panel' : 'border-line')} style={{ background: c }} />)}
              <ColorField label="Custom accent colour" value={accent} onChange={setAccent} showValue={false} />
            </div>
          </div>
        </div>

        <div>
          <Label>Protocol</Label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Wire protocol">
            {PROTOCOLS.map((p) => (
              <button key={p.kind} role="radio" aria-checked={kind === p.kind} data-protocol={p.kind} onClick={() => setKind(p.kind)} className={cn('rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors duration-150', kind === p.kind ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-muted hover:border-line-strong hover:text-fg')}>{p.label}</button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted">{info.hint} <span className="font-mono text-faint">{info.chatPath}</span></p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Base URL</Label><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={info.placeholder} aria-label="Base URL" data-testid="cp-url" /></div>
          <div>
            <Label>API key {noKey && <span className="text-faint">(not required)</span>}</Label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={noKey} placeholder={editing && savedKey ? '•••••••• saved in Vault' : 'sk-…'} aria-label="API key" autoComplete="off" data-testid="cp-key" />
            <label className="mt-1 flex items-center gap-1.5 text-[11px] text-muted"><input type="checkbox" checked={noKey} onChange={(e) => setNoKey(e.target.checked)} />No API key needed (local / open proxy)</label>
          </div>
        </div>
        <label className="flex items-start gap-2 rounded-xl border border-line bg-subtle/40 p-3 text-xs text-muted" data-testid="cp-proxy"><input type="checkbox" className="mt-0.5" checked={viaProxy} onChange={(e) => { proxyTouched.current = true; setViaProxy(e.target.checked) }} aria-label="Route via UnQStudio CORS Proxy" /><span><span className="block font-medium text-fg">Route via UnQStudio CORS Proxy</span>Browsers block many gateways (no CORS headers). The proxy relays requests and streams replies — your key is only forwarded to this provider, never stored. Off for localhost.</span></label>
        {kind === 'anthropic' && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={browserAccess} onChange={(e) => setBrowserAccess(e.target.checked)} />Send <code className="rounded bg-subtle px-1">anthropic-dangerous-direct-browser-access</code> (required to call Anthropic from a browser)</label>}

        <div>
          <div className="mb-1 flex items-center justify-between"><Label>Custom HTTP headers <span className="text-faint">(optional · stored encrypted)</span></Label><Button size="sm" variant="ghost" onClick={() => setRows([...rows, { k: '', v: '' }])}><Plus size={12} />Add Header</Button></div>
          {rows.map((r, i) => (
            <div key={i} className="mb-1 flex gap-1.5">
              <Input value={r.k} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} placeholder="X-Header" aria-label="Header name" className="h-8 flex-1 text-xs" />
              <Input value={r.v} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} placeholder="value" aria-label="Header value" className="h-8 flex-[1.5] text-xs" />
              <Button size="icon-sm" variant="ghost" aria-label="Remove header" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X size={13} /></Button>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-line bg-subtle/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void testFetch()} disabled={fetched.status === 'loading'} data-testid="cp-test">{fetched.status === 'loading' ? <Spinner size={12} /> : <RefreshCw size={12} />}Test & Auto-Fetch Models</Button>
            <span className="font-mono text-[10px] text-faint">{info.modelsPath}</span>
            {fetched.status === 'ok' && <span data-testid="cp-fetched"><Badge tone="success"><Check size={10} />{fetched.models.length} models · {fetched.ms}ms</Badge></span>}
          </div>
          {fetched.status === 'error' && <p className="mt-2 text-xs text-danger" role="alert">{fetched.message} You can still add model IDs manually below.</p>}
          {fetched.status === 'ok' && (
            <ul className="mt-2 max-h-32 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-panel text-xs" data-testid="cp-preview">
              {fetched.models.slice(0, 60).map((m) => <li key={m.id} className="truncate px-2.5 py-1 font-mono text-[11px]">{m.id}</li>)}
              {fetched.models.length > 60 && <li className="px-2.5 py-1 text-faint">+{fetched.models.length - 60} more</li>}
            </ul>
          )}
        </div>

        <div>
          <Label>Add Model ID <span className="text-faint">(for proxies that disable /models)</span></Label>
          <div className="flex gap-1.5">
            <Input value={modelInput} onChange={(e) => setModelInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addModel() } }} placeholder="e.g. my-model-v1" aria-label="Model ID" className="h-8 flex-1 text-xs" data-testid="cp-model-input" />
            <Button size="sm" variant="secondary" onClick={addModel}><Plus size={12} />Add</Button>
          </div>
          {models.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{models.map((m) => <span key={m} className="inline-flex items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[11px]">{m}<button aria-label={`Remove ${m}`} onClick={() => setModels(models.filter((x) => x !== m))}><Trash2 size={10} className="text-faint hover:text-danger" /></button></span>)}</div>}
        </div>
      </div>
    </Modal>
  )
}
