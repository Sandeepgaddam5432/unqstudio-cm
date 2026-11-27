import { useState } from 'react'
import { Cloud, Database, GitBranch, Globe, Plus, Search, Server } from 'lucide-react'
import { Badge, Dropdown, Input, Modal } from '@/ui/primitives'
import { SERVICES, isConnected } from '@/store/connections'
import { useApp } from '@/store/app'
import { cn } from '@/lib/cn'

type Cat = 'Home' | 'All connectors' | 'Enabled' | 'Build' | 'Deploy' | 'Data'
const PILLS: Cat[] = ['Home', 'All connectors', 'Enabled', 'Build', 'Deploy', 'Data']
const CAT: Record<string, Exclude<Cat, 'Home' | 'All connectors' | 'Enabled'>> = { github: 'Build', gitlab: 'Build', supabase: 'Data', netlify: 'Deploy', vercel: 'Deploy', cloudflare: 'Deploy' }
const ICON: Record<string, React.ReactNode> = { github: <GitBranch size={18} />, gitlab: <GitBranch size={18} />, supabase: <Database size={18} />, netlify: <Cloud size={18} />, vercel: <Cloud size={18} />, cloudflare: <Cloud size={18} /> }
const FEATURED = ['github', 'supabase', 'netlify']

/** Categorised, searchable connectors hub: build / deploy / data services and custom APIs. */
export function ConnectorsHub() {
  const sheet = useApp((s) => s.sheet)
  const closeSheet = useApp((s) => s.closeSheet)
  const openSettings = useApp((s) => s.openSettings)
  const [cat, setCat] = useState<Cat>('Home')
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const list = SERVICES.filter((s) => {
    if (needle && !`${s.name} ${s.blurb}`.toLowerCase().includes(needle)) return false
    if (cat === 'Home') return FEATURED.includes(s.id)
    if (cat === 'Enabled') return isConnected(s.id)
    if (cat === 'All connectors') return true
    return CAT[s.id] === cat
  })
  const go = (tab: string) => { closeSheet(); openSettings(tab) }
  const showCustom = !needle || 'custom api mcp http'.includes(needle)
  return (
    <Modal open={sheet === 'connectors'} onClose={closeSheet} title="Connectors" description="Connect build, deploy and data services. Credentials stay encrypted on this device." size="lg">
      <div data-connectors-hub className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-quaternary" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search connectors" aria-label="Search connectors" className="pl-9" /></div>
          <Dropdown align="end" width={230} trigger={<button data-add-custom className="press flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-fg-primary px-4 text-[13px] font-medium text-base"><Plus size={14} />Add custom</button>}
            items={[{ label: 'Custom provider (OpenAI / Anthropic / Gemini / Ollama)', icon: <Server size={14} />, onSelect: () => go('providers') }, { label: 'Remote HTTP MCP connector', icon: <Globe size={14} />, onSelect: () => go('features') }]} />
        </div>
        <div className="hide-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1" role="tablist" aria-label="Connector categories">
          {PILLS.map((c) => <button key={c} role="tab" aria-selected={cat === c} data-connector-pill={c} onClick={() => setCat(c)} className={cn('press h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium', cat === c ? 'bg-fg-primary text-base' : 'bg-primary text-fg-secondary shadow-xs-surface')}>{c}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((s) => {
            const on = isConnected(s.id)
            return (
              <div key={s.id} data-connector-card={s.id} className="flex flex-col gap-2 rounded-2xl bg-primary p-4 shadow-xs-surface">
                <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-depth">{ICON[s.id]}</span><div className="min-w-0 flex-1"><p className="t-label font-medium">{s.name}</p><p className="t-meta text-fg-tertiary">{CAT[s.id]}</p></div><Badge tone={on ? 'success' : 'neutral'}>{on ? 'Enabled' : 'Not connected'}</Badge></div>
                <p className="t-meta text-fg-secondary">{s.blurb}</p>
                <button onClick={() => go('connections')} className="press mt-auto h-9 self-start rounded-full bg-depth px-4 text-[13px] font-medium">{on ? 'Manage' : 'Connect'}</button>
              </div>
            )
          })}
          {showCustom && (cat === 'Home' || cat === 'All connectors') && (
            <div data-connector-card="custom" className="flex flex-col gap-2 rounded-2xl border border-dashed border-line-strong p-4">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-depth"><Server size={18} /></span><div><p className="t-label font-medium">Custom API</p><p className="t-meta text-fg-tertiary">Your own endpoint</p></div></div>
              <p className="t-meta text-fg-secondary">Bring any OpenAI-compatible, Anthropic, Gemini or Ollama endpoint, or a remote HTTP MCP server.</p>
              <button onClick={() => go('providers')} className="press mt-auto h-9 self-start rounded-full bg-depth px-4 text-[13px] font-medium">Add custom</button>
            </div>
          )}
        </div>
        {list.length === 0 && !showCustom && <p className="py-6 text-center text-sm text-fg-tertiary">No connectors match.</p>}
      </div>
    </Modal>
  )
}
