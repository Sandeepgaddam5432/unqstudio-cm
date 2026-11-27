import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Search, Trash2, Upload } from 'lucide-react'
import { Button, Input, Modal, Segmented, SelectSheet, Switch, Textarea } from '@/ui/primitives'
import { LANGUAGES, PERM_ROWS, usePrefs, type Perm } from '@/store/prefs'
import { deleteSkill, listSkills, parseSkillFile, saveSkill } from '@/core/skills'
import { useApp } from '@/store/app'
import { toast } from '@/store/toast'

interface Item { id: string; group: string; label: string; keywords: string; render: () => ReactNode }

const Line = ({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="t-label font-medium">{label}</p>{desc && <p className="t-meta text-fg-tertiary">{desc}</p>}</div><div className="shrink-0">{children}</div></div>
)

function Skills() {
  const skills = usePrefs((s) => s.skills)
  const setSkills = usePrefs((s) => s.setSkills)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { void listSkills().then(setSkills).catch(() => undefined) }, [setSkills])
  const upload = async (f: File) => {
    const sk = parseSkillFile(f.name, await f.text())
    if (!sk) return toast.error('Could not read skill', 'Use a .md, .txt or .json file with instructions.')
    await saveSkill(sk); setSkills(await listSkills()); toast.success('Skill added', sk.name)
  }
  return (
    <div className="space-y-2" data-skills>
      <input ref={file} type="file" accept=".md,.markdown,.txt,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
      <Button size="sm" onClick={() => file.current?.click()}><Upload size={13} />Upload skill</Button>
      {skills.length === 0 && <p className="t-meta text-fg-tertiary">No skills yet. Upload reusable markdown or JSON instructions — they are stored locally and added to every prompt while enabled.</p>}
      {skills.map((s) => (
        <div key={s.id} data-skill-row className="flex items-center gap-2 rounded-xl bg-depth/60 px-3 py-2"><span className="min-w-0 flex-1 truncate text-[13px]">{s.name}</span>
          <Switch checked={s.enabled} label={`Enable ${s.name}`} onChange={async (v) => { await saveSkill({ ...s, enabled: v }); setSkills(await listSkills()) }} />
          <button aria-label={`Delete ${s.name}`} onClick={async () => { await deleteSkill(s.id); setSkills(await listSkills()) }} className="press flex h-9 w-9 items-center justify-center rounded-full text-fg-tertiary hover:bg-depth"><Trash2 size={14} /></button></div>
      ))}
    </div>
  )
}

function Memory() {
  const memory = usePrefs((s) => s.memory)
  const add = usePrefs((s) => s.addMemory)
  const remove = usePrefs((s) => s.removeMemory)
  const [v, setV] = useState('')
  return (
    <div className="space-y-2" data-memory>
      <div className="flex gap-2"><Input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { add(v); setV('') } }} placeholder="e.g. I prefer TypeScript and Tailwind" aria-label="Add memory" /><Button onClick={() => { add(v); setV('') }}>Add</Button></div>
      {memory.map((m, i) => <div key={i} className="flex items-center gap-2 rounded-xl bg-depth/60 px-3 py-2"><span className="min-w-0 flex-1 text-[13px] [overflow-wrap:anywhere]">{m}</span><button aria-label="Remove memory" onClick={() => remove(i)} className="press flex h-8 w-8 items-center justify-center rounded-full text-fg-tertiary hover:bg-depth"><Trash2 size={13} /></button></div>)}
    </div>
  )
}

/** Searchable, grouped Account settings: Preferences · Personalization · Access & Devices. */
export function AccountSettings() {
  const sheet = useApp((s) => s.sheet)
  const closeSheet = useApp((s) => s.closeSheet)
  const openSheet = useApp((s) => s.openSheet)
  const p = usePrefs()
  const [q, setQ] = useState('')
  const items: Item[] = [
    { id: 'language', group: 'Preferences', label: 'Language', keywords: 'locale translate', render: () => <Line label="Language" desc="Interface language preference."><SelectSheet aria-label="Language" title="Language" value={p.language} onChange={(v) => { p.set({ language: v }) }} className="w-44" options={LANGUAGES.map((l) => ({ value: l, label: l }))} /></Line> },
    { id: 'suggestions', group: 'Preferences', label: 'Chat suggestions', keywords: 'follow up chips', render: () => <Line label="Chat suggestions" desc="Show follow-up chips after a build."><Switch checked={p.suggestions} onChange={(v) => p.set({ suggestions: v })} label="Chat suggestions" /></Line> },
    { id: 'tips', group: 'Preferences', label: 'Tips & tricks', keywords: 'hints help', render: () => <Line label="Tips & tricks" desc="Occasional hints about shortcuts and features."><Switch checked={p.tips} onChange={(v) => p.set({ tips: v })} label="Tips and tricks" /></Line> },
    { id: 'queue', group: 'Preferences', label: 'Message queue', keywords: 'busy agent queue', render: () => <Line label="Message queue" desc="Messages sent while the agent is busy are queued and run next."><Switch checked={p.messageQueue} onChange={(v) => p.set({ messageQueue: v })} label="Message queue" /></Line> },
    { id: 'sound', group: 'Preferences', label: 'Generation complete sound', keywords: 'chime audio notification', render: () => <Line label="Generation complete sound" desc="A subtle chime when a build finishes."><Switch checked={p.completeSound} onChange={(v) => p.set({ completeSound: v })} label="Generation complete sound" /></Line> },
    { id: 'instructions', group: 'Personalization', label: 'Instructions', keywords: 'rules custom global prompt', render: () => <div><p className="t-label mb-1 font-medium">Instructions</p><Textarea value={p.instructions} onChange={(e) => p.set({ instructions: e.target.value })} rows={4} aria-label="Global instructions" placeholder="Rules applied to every project, e.g. “Use TypeScript, keep components small.”" /></div> },
    { id: 'skills', group: 'Personalization', label: 'Skills', keywords: 'upload markdown json indexeddb', render: () => <div><p className="t-label mb-1 font-medium">Skills</p><Skills /></div> },
    { id: 'memory', group: 'Personalization', label: 'Memory', keywords: 'facts remember preferences', render: () => <div><p className="t-label mb-1 font-medium">Memory</p><Memory /></div> },
    ...PERM_ROWS.map((r): Item => ({ id: `perm-${r.key}`, group: 'Access & Devices', label: `Permissions · ${r.label}`, keywords: 'agent allow ask deny permissions', render: () => <div data-perm-key={r.key}><Line label={r.label} desc={r.desc}><span /></Line><Segmented<Perm> value={p.permissions[r.key]} onChange={(v) => p.setPerm(r.key, v)} items={[{ id: 'allow', label: 'Allow' }, { id: 'ask', label: 'Ask each time' }, { id: 'deny', label: 'Deny' }]} /></div> })),
  ]
  const needle = q.trim().toLowerCase()
  const shown = items.filter((i) => !needle || `${i.label} ${i.group} ${i.keywords}`.toLowerCase().includes(needle))
  const groups = [...new Set(shown.map((i) => i.group))]
  return (
    <Modal open={sheet === 'accountSettings'} onClose={closeSheet} title="Account settings" size="lg">
      <div data-account-settings className="space-y-4">
        <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-quaternary" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" aria-label="Search settings" className="pl-9" /></div>
        {groups.map((g) => (
          <section key={g} data-settings-group={g}><h3 className="t-meta mb-1 font-semibold uppercase tracking-wider text-fg-tertiary">{g}</h3>
            <div className="divide-y divide-line rounded-2xl bg-primary px-3 shadow-xs-surface">{shown.filter((i) => i.group === g).map((i) => <div key={i.id} className="py-2" data-setting={i.id}>{i.render()}</div>)}</div></section>
        ))}
        {shown.length === 0 && <p className="py-6 text-center text-sm text-fg-tertiary">No settings match “{q}”.</p>}
        <button onClick={() => openSheet('workspaceSettings')} data-open-workspace-settings className="press flex min-h-[48px] w-full items-center justify-between rounded-2xl bg-primary px-4 text-[14px] font-medium shadow-xs-surface">Workspace settings<ArrowRight size={15} className="text-fg-tertiary" /></button>
      </div>
    </Modal>
  )
}
