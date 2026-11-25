import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, Input, Label, Section, Switch, Textarea } from '@/ui/primitives'
import { useSettings, type CustomPrompt } from '@/store/settings'
import { uid } from '@/lib/util'

const PRESETS: Array<{ name: string; content: string }> = [
  { name: 'Strict TypeScript', content: 'Write strictly typed TypeScript. Never use `any`; prefer discriminated unions and explicit return types for exported functions.' },
  { name: 'Accessibility first', content: 'Every interactive element must be keyboard accessible with visible focus, correct ARIA roles/labels and sufficient colour contrast (WCAG AA).' },
  { name: 'Tailwind only', content: 'Style exclusively with Tailwind utility classes and the theme tokens (bg-bg, text-fg, bg-accent…). Do not write custom CSS unless unavoidable.' },
  { name: 'Concise answers', content: 'Keep explanations to two or three sentences. Do not repeat code that is already visible in the files.' },
  { name: 'Small components', content: 'Split UI into small focused components (< 120 lines) in /src/components with clear props. Keep state as local as possible.' },
]

export function PromptsTab() {
  const prompts = useSettings((s) => s.customPrompts)
  const set = useSettings((s) => s.set)
  const [draft, setDraft] = useState<CustomPrompt>({ id: '', name: '', content: '', enabled: true })
  const save = () => {
    if (!draft.name.trim() || !draft.content.trim()) return
    set({ customPrompts: draft.id ? prompts.map((p) => (p.id === draft.id ? draft : p)) : [...prompts, { ...draft, id: uid('r_') }] })
    setDraft({ id: '', name: '', content: '', enabled: true })
  }
  return (
    <div className="p-5">
      <Section title={draft.id ? 'Edit rule' : 'New rule'} description="Enabled rules are appended to every system prompt (Build, Plan and Ask).">
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Brand voice" /></div>
          <div><Label>Instruction</Label><Textarea rows={4} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Always…" /></div>
          <div className="flex gap-2"><Button variant="primary" size="sm" onClick={save} disabled={!draft.name.trim() || !draft.content.trim()}><Plus size={13} />{draft.id ? 'Update' : 'Add rule'}</Button>{draft.id && <Button size="sm" variant="ghost" onClick={() => setDraft({ id: '', name: '', content: '', enabled: true })}>Cancel</Button>}</div>
        </div>
      </Section>
      <Section title="Your rules">
        {prompts.length === 0 && <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-xs text-muted">No rules yet — add one above or start from a preset.</p>}
        <div className="space-y-2">
          {prompts.map((p) => (
            <div key={p.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
              <div className="min-w-0 flex-1"><p className="text-[13px] font-medium">{p.name}</p><p className="mt-0.5 line-clamp-2 text-xs text-muted">{p.content}</p></div>
              <Switch checked={p.enabled} onChange={(v) => set({ customPrompts: prompts.map((x) => (x.id === p.id ? { ...x, enabled: v } : x)) })} label={`Enable ${p.name}`} />
              <Button variant="ghost" size="icon-sm" onClick={() => setDraft(p)} aria-label="Edit"><Pencil size={13} /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => set({ customPrompts: prompts.filter((x) => x.id !== p.id) })} aria-label="Delete"><Trash2 size={13} /></Button>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Presets">
        <div className="flex flex-wrap gap-2">
          {PRESETS.filter((pr) => !prompts.some((p) => p.name === pr.name)).map((pr) => <Button key={pr.name} size="sm" onClick={() => set({ customPrompts: [...prompts, { id: uid('r_'), name: pr.name, content: pr.content, enabled: true }] })}><Plus size={12} />{pr.name}</Button>)}
        </div>
      </Section>
    </div>
  )
}
