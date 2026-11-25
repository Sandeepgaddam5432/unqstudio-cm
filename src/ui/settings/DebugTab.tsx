import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, Trash2, X } from 'lucide-react'
import { Button, Input, Section } from '@/ui/primitives'
import { useEvents, type EventCategory } from '@/store/events'
import { useSettings } from '@/store/settings'
import { buildDiagnosticsReport, detectCapabilities } from '@/core/diagnostics'
import { getAdapter } from '@/core/vfs/idbAdapter'
import { downloadBlob } from '@/lib/util'
import { toast } from '@/store/toast'
import { cn } from '@/lib/cn'
import type { StorageStats } from '@/core/vfs/types'

const CATS: Array<EventCategory | 'all'> = ['all', 'ai', 'compile', 'error', 'vfs', 'deploy', 'system']
const tone: Record<EventCategory, string> = { ai: 'text-accent', compile: 'text-success', error: 'text-danger', vfs: 'text-muted', deploy: 'text-warn', system: 'text-faint' }

export function DebugTab() {
  const { entries, clear } = useEvents()
  const [cat, setCat] = useState<EventCategory | 'all'>('all')
  const [q, setQ] = useState('')
  const [stats, setStats] = useState<StorageStats>()
  const [est, setEst] = useState<{ usage?: number; quota?: number }>({})
  const caps = useMemo(() => detectCapabilities(), [])
  useEffect(() => { void getAdapter().stats().then(setStats); void navigator.storage?.estimate?.().then(setEst) }, [])
  const shown = entries.filter((e) => (cat === 'all' || e.category === cat) && e.message.toLowerCase().includes(q.toLowerCase())).slice().reverse()
  const report = () => buildDiagnosticsReport({ settings: useSettings.getState() as unknown as Record<string, unknown>, stats, estimate: est, events: entries, capabilities: caps, env: { userAgent: navigator.userAgent, language: navigator.language, viewport: `${innerWidth}x${innerHeight}`, secureContext: isSecureContext, online: navigator.onLine } })

  return (
    <div className="p-5">
      <Section title="System capabilities" description="What this browser supports for UnQStudio.">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {caps.map((c) => (
            <div key={c.id} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-xs">
              {c.ok ? <Check size={14} className="mt-px shrink-0 text-success" /> : <X size={14} className="mt-px shrink-0 text-danger" />}
              <div><p>{c.label}</p>{c.detail && <p className="text-faint">{c.detail}</p>}</div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Diagnostics report" description="Includes settings (without keys), capabilities, storage and recent events.">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { void navigator.clipboard.writeText(JSON.stringify(report(), null, 2)); toast.success('Report copied') }}><Copy size={13} />Copy</Button>
          <Button size="sm" onClick={() => downloadBlob(new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' }), 'unqstudio-diagnostics.json')}><Download size={13} />Download</Button>
        </div>
      </Section>
      <Section title="Event log" right={<Button size="xs" variant="ghost" onClick={clear}><Trash2 size={11} />Clear</Button>}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={cn('rounded-full border px-2.5 py-0.5 text-[11px] capitalize', cat === c ? 'border-fg bg-fg text-bg' : 'border-line text-muted')}>{c}</button>)}
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="ml-auto h-7 w-40 text-xs" />
        </div>
        <div className="max-h-80 overflow-auto rounded-xl border border-line bg-subtle/40 font-mono text-[11px]">
          {shown.length === 0 && <p className="p-4 text-center font-sans text-xs text-muted">No events yet. Build a project or send a message.</p>}
          {shown.map((e) => (
            <div key={e.id} className="flex gap-2 border-b border-line/60 px-3 py-1.5 last:border-0">
              <span className="shrink-0 text-faint">{new Date(e.ts).toLocaleTimeString([], { hour12: false })}</span>
              <span className={cn('w-14 shrink-0 uppercase', tone[e.category])}>{e.category}</span>
              <span className="min-w-0 flex-1 break-words">{e.message}</span>
              {e.durationMs != null && <span className="shrink-0 text-muted">{e.durationMs}ms</span>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
