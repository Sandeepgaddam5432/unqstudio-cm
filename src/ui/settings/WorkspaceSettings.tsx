import { useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { Input, Modal } from '@/ui/primitives'
import { navigateToView, useApp } from '@/store/app'
import { cn } from '@/lib/cn'

interface Row { label: string; desc: string; run: () => void }
interface Group { id: string; title: string; rows: Row[] }

/** Collapsible, searchable Workspace settings: Customization · Build & deploy · Security. */
export function WorkspaceSettings() {
  const sheet = useApp((s) => s.sheet)
  const closeSheet = useApp((s) => s.closeSheet)
  const openSheet = useApp((s) => s.openSheet)
  const openSettings = useApp((s) => s.openSettings)
  const [q, setQ] = useState('')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const go = (tab: string) => () => { closeSheet(); openSettings(tab) }
  const groups: Group[] = [
    { id: 'custom', title: 'Customization', rows: [
      { label: 'Instructions', desc: 'Global rules applied to every project', run: () => openSheet('accountSettings') },
      { label: 'Skills', desc: 'Reusable markdown / JSON agent skills', run: () => openSheet('accountSettings') },
      { label: 'Templates', desc: 'Starter templates and showcase', run: () => { closeSheet(); navigateToView('home'); setTimeout(() => document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth' }), 200) } },
      { label: 'Design systems', desc: 'Prompt rules, appearance and theme presets', run: go('prompts') },
    ] },
    { id: 'deploy', title: 'Build & deploy', rows: [
      { label: 'Git', desc: 'GitHub / GitLab connections', run: go('connections') },
      { label: 'MCP server', desc: 'Plugins and remote HTTP MCP connectors', run: go('features') },
      { label: 'Workspace domains', desc: 'Deploy hosts and custom domains', run: go('connections') },
    ] },
    { id: 'security', title: 'Security', rows: [
      { label: 'Privacy & Vault', desc: 'Encrypted key vault and local data', run: go('data') },
      { label: 'Data exports', desc: 'Backups and project exports', run: go('data') },
    ] },
  ]
  const needle = q.trim().toLowerCase()
  const vis = groups.map((g) => ({ ...g, rows: g.rows.filter((r) => !needle || `${r.label} ${r.desc} ${g.title}`.toLowerCase().includes(needle)) })).filter((g) => g.rows.length)
  return (
    <Modal open={sheet === 'workspaceSettings'} onClose={closeSheet} title="Workspace settings" size="md">
      <div data-workspace-settings className="space-y-3">
        <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-quaternary" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workspace settings" aria-label="Search workspace settings" className="pl-9" /></div>
        {vis.map((g) => {
          const open = needle ? true : !closed[g.id]
          return (
            <section key={g.id} data-ws-group={g.id} className="overflow-hidden rounded-2xl bg-primary shadow-xs-surface">
              <button onClick={() => setClosed((c) => ({ ...c, [g.id]: open }))} aria-expanded={open} className="flex min-h-[48px] w-full items-center gap-2 px-4 text-left text-[14px] font-medium"><ChevronRight size={15} className={cn('text-fg-tertiary transition-transform', open && 'rotate-90')} />{g.title}</button>
              {open && <div className="divide-y divide-line border-t border-line">{g.rows.map((r) => <button key={r.label} onClick={r.run} className="press flex min-h-[52px] w-full flex-col justify-center px-4 py-2 text-left hover:bg-depth"><span className="text-[14px]">{r.label}</span><span className="t-meta text-fg-tertiary">{r.desc}</span></button>)}</div>}
            </section>
          )
        })}
        {vis.length === 0 && <p className="py-6 text-center text-sm text-fg-tertiary">No settings match.</p>}
      </div>
    </Modal>
  )
}
