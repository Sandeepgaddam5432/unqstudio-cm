import type { ReactNode } from 'react'
import { ExternalLink, KeyRound } from 'lucide-react'
import { Button } from '@/ui/primitives'
import { useApp } from '@/store/app'
import { isConnected } from '@/store/connections'
import { useVault } from '@/store/vault'
import type { ServiceId } from '@/core/deploy/verify'

export function useConnected(service: ServiceId) {
  useVault((v) => v.rev)
  return isConnected(service)
}

export function NotConnected({ service, name }: { service: ServiceId; name: string }) {
  const { openSettings, setPublishOpen } = useApp()
  return (
    <div className="rounded-xl border border-dashed border-line-strong p-5 text-center">
      <KeyRound size={18} className="mx-auto mb-2 text-faint" />
      <p className="text-sm font-medium">Connect {name} first</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted">Add a personal access token under Settings → Connections. It is stored in your local vault and used only for direct browser → {name} API calls.</p>
      <Button className="mt-3" variant="primary" size="sm" onClick={() => { setPublishOpen(false); openSettings('connections') }} data-service={service}>Open Connections</Button>
    </div>
  )
}

export function LogBox({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  return <pre className="mt-3 max-h-36 overflow-auto rounded-xl border border-line bg-subtle p-3 font-mono text-[11px] leading-relaxed text-muted">{lines.join('\n')}</pre>
}

export function ResultLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
      <span className="min-w-0 truncate">{label}</span><ExternalLink size={14} className="shrink-0" />
    </a>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between"><label className="text-xs font-medium text-muted">{label}</label>{hint && <span className="text-[11px] text-faint">{hint}</span>}</div>
      {children}
    </div>
  )
}
