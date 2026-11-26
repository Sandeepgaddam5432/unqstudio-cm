import { useState } from 'react'
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button } from '@/ui/primitives'
import { ProviderIcon } from '@/ui/icons/ProviderIcon'
import { useCustomProviders } from '@/store/customProviders'
import { getSecret, useVault } from '@/store/vault'
import { useSettings } from '@/store/settings'
import { protocolInfo, secretNames } from '@/core/ai/customProviders'
import { toast } from '@/store/toast'

const host = (u: string) => { try { return new URL(u).host } catch { return u } }

/** “+ Add Custom Provider” call-to-action + cards with Edit / Duplicate / Delete. */
export function CustomProviderCards({ compact = false }: { compact?: boolean }) {
  const { providers, openNew, openEdit, duplicate, remove } = useCustomProviders()
  const vault = useVault()
  useVault((v) => v.rev)
  const [confirm, setConfirm] = useState<string | null>(null)

  const dup = async (id: string) => {
    const copy = duplicate(id)
    if (!copy) return
    const a = secretNames(id), b = secretNames(copy.id)
    const k = getSecret(a.key), h = getSecret(a.headers)
    try { if (k) await vault.setSecret(b.key, k); if (h) await vault.setSecret(b.headers, h) } catch { /* locked vault: copy keeps no secrets */ }
    toast.success('Provider duplicated', 'Key and headers were copied.')
  }
  const del = async (id: string) => {
    remove(id); setConfirm(null)
    const sn = secretNames(id)
    try { await vault.removeSecret(sn.key); await vault.removeSecret(sn.headers) } catch { /* ignore */ }
    const st = useSettings.getState(); const { [id]: _drop, ...rest } = st.enabled; void _drop; st.set({ enabled: rest })
    toast.info('Provider deleted')
  }

  return (
    <div data-testid="custom-provider-cards">
      <Button variant="primary" onClick={openNew} className="w-full sm:w-auto" data-testid="add-custom-provider"><Plus size={14} />Add Custom Provider</Button>
      {providers.length === 0 && !compact && <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-5 text-center text-xs text-muted">No custom providers yet. Connect any OpenAI-, Anthropic-, Gemini- or Ollama-style endpoint — a private gateway, a proxy, or a self-hosted model.</p>}
      <ul className="mt-3 space-y-1.5">
        {providers.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5" data-custom-provider={p.id}>
            <ProviderIcon id={p.id} name={p.name} brand={p.brand} accent={p.accent} size={20} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5"><span className="truncate text-[13px] font-medium">{p.name}</span><Badge tone="accent">{protocolInfo(p.kind).label}</Badge></div>
              <p className="truncate font-mono text-[11px] text-faint">{host(p.baseUrl)} · {p.models.length} manual model{p.models.length === 1 ? '' : 's'}{p.headerNames.length ? ` · ${p.headerNames.length} header${p.headerNames.length === 1 ? '' : 's'}` : ''}</p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => openEdit(p.id)}><Pencil size={13} /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Duplicate ${p.name}`} onClick={() => void dup(p.id)}><Copy size={13} /></Button>
              {confirm === p.id
                ? <Button size="sm" variant="danger" onClick={() => void del(p.id)}>Delete?</Button>
                : <Button size="icon-sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => setConfirm(p.id)}><Trash2 size={13} /></Button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
