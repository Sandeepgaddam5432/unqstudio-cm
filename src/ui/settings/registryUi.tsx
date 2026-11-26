import { RefreshCw } from 'lucide-react'
import { Badge, Button } from '@/ui/primitives'
import { useModels } from '@/store/models'
import { countModels } from '@/core/ai/modelsDev'

export const ago = (t: number, now = Date.now()): string => {
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/** Model Catalog status + "Refresh Catalog" button + last-synced timestamp. */
export function RegistryCard() {
  const { registry, registrySource, syncedAt, registryStatus, registryError, loadRegistry } = useModels()
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line p-3" data-registry-card>
      <div className="min-w-0">
        <p className="text-[13px] font-medium">Model Catalog {registry && <Badge tone="success" className="ml-1">{registry.providers.length} providers · {countModels(registry).toLocaleString()} models</Badge>}</p>
        <p className="mt-0.5 text-xs text-muted">
          {registryStatus === 'error' ? <span className="text-danger">Could not load: {registryError}</span> : <>Source: {registrySource ?? '…'} · Last synced: {syncedAt ? new Date(syncedAt).toLocaleString() : 'never'}. New providers appear automatically.</>}
        </p>
      </div>
      <Button size="sm" onClick={() => void loadRegistry(true)} disabled={registryStatus === 'loading'}><RefreshCw size={13} className={registryStatus === 'loading' ? 'animate-spin-fast' : ''} />Refresh Catalog</Button>
    </div>
  )
}
