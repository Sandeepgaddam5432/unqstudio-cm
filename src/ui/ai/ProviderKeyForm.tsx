import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ExternalLink, KeyRound, Lock, Plus, RefreshCw, X } from 'lucide-react'
import { Badge, Button, Input, Label, Spinner } from '@/ui/primitives'
import { useVault, providerSecretName, getSecret } from '@/store/vault'
import { useSettings } from '@/store/settings'
import { testConnection } from '@/core/ai/orchestrator'
import type { ProviderDef } from '@/core/ai/providers'
import { toast } from '@/store/toast'
import { useModels } from '@/store/models'
import { fetchLiveFor, modelsForProvider } from '@/store/aiConfig'

export function ProviderKeyForm({ provider, onSaved }: { provider: ProviderDef; onSaved?: () => void }) {
  const vault = useVault()
  const settings = useSettings()
  const saved = getSecret(providerSecretName(provider.id))
  const [key, setKey] = useState('')
  const [url, setUrl] = useState(settings.baseUrls[provider.id] ?? '')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; ms: number; models?: string[] } | null>(null)
  const [newModel, setNewModel] = useState('')
  const effectiveUrl = url.trim() || undefined
  const live = useModels((m) => m.live[provider.id])
  const proxyOnly = provider.compat === 'requires-proxy'
  const fetchModels = () => void fetchLiveFor(provider, { apiKey: key.trim() || undefined, baseUrl: effectiveUrl })
  // Debounced auto-fetch of the provider's LIVE /models endpoint as soon as a plausible key is typed.
  useEffect(() => {
    const k = key.trim()
    if (provider.noKey || proxyOnly || k.length < 8) return
    const t = setTimeout(() => { void fetchLiveFor(provider, { apiKey: k, baseUrl: effectiveUrl }) }, 900)
    return () => clearTimeout(t)
  }, [key, url])

  const test = async () => {
    setTesting(true)
    setResult(null)
    const r = await testConnection(provider, key.trim() || saved, effectiveUrl)
    setResult(r)
    setTesting(false)
  }
  const save = async () => {
    if (vault.locked) return vault.setUnlockOpen(true)
    try {
      if (key.trim()) await vault.setSecret(providerSecretName(provider.id), key.trim())
      settings.set({ baseUrls: { ...settings.baseUrls, [provider.id]: url.trim() }, enabled: { ...settings.enabled, [provider.id]: true } })
      if (!proxyOnly) void fetchLiveFor(provider, { apiKey: key.trim() || undefined, baseUrl: url.trim() || undefined })
      setKey('')
      toast.success(`${provider.name} saved`)
      onSaved?.()
    } catch (e) { toast.error('Could not save', String(e)) }
  }
  const remove = async () => { await vault.removeSecret(providerSecretName(provider.id)); toast.info('Key removed') }
  const models = settings.userModels[provider.id] ?? []
  const addModel = (id: string) => {
    const v = id.trim()
    if (!v || models.includes(v)) return
    settings.set({ userModels: { ...settings.userModels, [provider.id]: [...models, v] } })
    setNewModel('')
  }

  return (
    <div className="space-y-3">
      {vault.locked && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs">
          <span className="flex items-center gap-2"><Lock size={13} />Your key vault is locked.</span>
          <Button size="xs" variant="primary" onClick={() => vault.setUnlockOpen(true)}>Unlock</Button>
        </div>
      )}
      {!provider.noKey && (
        <div>
          <Label hint={provider.keyUrl && <a href={provider.keyUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent">Get a key <ExternalLink size={10} /></a>}>API key {saved && <Badge tone="success" className="ml-1"><Check size={9} />saved</Badge>}</Label>
          <Input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder={saved ? '•••••••• (leave empty to keep)' : 'Paste your API key'} />
        </div>
      )}
      <div>
        <Label hint={provider.baseUrl}>Base URL {(provider.local || provider.id === 'custom') ? '' : '(optional override)'}</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={provider.baseUrl} spellCheck={false} />
      </div>
      {proxyOnly && (
        <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs text-muted"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" /><span><b className="text-fg">Requires Proxy / Gateway 🔌</b> — {provider.name} needs server-side credentials (IAM / signed requests), so it can’t be called directly from a browser. Use it through a gateway (e.g. OpenRouter) or set a custom base URL pointing at your own proxy.</span></div>
      )}
      <div data-models-block>
        <Label hint={<span className="flex items-center gap-1.5">{live?.status === 'loading' && <Spinner size={11} />}{live?.status === 'ok' && <Badge tone="success">live · {live.models.length}</Badge>}{live?.status === 'error' && <Badge tone="danger" className="max-w-[16rem] truncate" >{live.error}</Badge>}</span>}>Models</Label>
        <div className="mb-2 flex max-h-28 flex-wrap gap-1.5 overflow-auto">
          {modelsForProvider(provider).slice(0, 60).map((m) => (
            <span key={m.id} className="inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-subtle px-2 py-0.5 font-mono text-[11px]"><span className="truncate">{m.id}</span>{models.includes(m.id) && <button onClick={() => settings.set({ userModels: { ...settings.userModels, [provider.id]: models.filter((x) => x !== m.id) } })} aria-label={`Remove ${m.id}`}><X size={10} /></button>}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addModel(newModel)} placeholder="Add a custom model ID…" className="h-8 text-xs" />
          <Button size="sm" onClick={() => addModel(newModel)}><Plus size={13} />Add</Button>
          <Button size="sm" onClick={fetchModels} disabled={proxyOnly || live?.status === 'loading' || (!provider.noKey && !key.trim() && !saved)} data-fetch-models>{live?.status === 'loading' ? <Spinner size={12} /> : <RefreshCw size={12} />}<span className="hidden sm:inline">Fetch Models</span></Button>
        </div>
        {result?.models && result.models.length > 0 && (
          <div className="mt-2"><p className="mb-1 text-[11px] text-muted">Detected on this endpoint (click to add):</p><div className="flex max-h-24 flex-wrap gap-1 overflow-auto">{result.models.slice(0, 40).map((m) => <button key={m} onClick={() => addModel(m)} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] hover:bg-subtle">{m}</button>)}</div></div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={save}><KeyRound size={13} />Save</Button>
        <Button size="sm" onClick={test} disabled={testing || (!provider.noKey && !key.trim() && !saved)}>{testing ? <Spinner size={12} /> : null}Test connection</Button>
        {saved && <Button size="sm" variant="ghost" onClick={remove}>Remove key</Button>}
      </div>
      {result && <p className={`rounded-lg border px-3 py-2 text-xs ${result.ok ? 'border-success/30 bg-success/5 text-success' : 'border-danger/30 bg-danger/5 text-danger'}`}>{result.message} <span className="text-faint">({result.ms}ms)</span></p>}
    </div>
  )
}
