import { useEffect, useState } from 'react'
import { MousePointerClick, Save, Sparkles, X } from 'lucide-react'
import { Button, Input, Label } from '@/ui/primitives'
import { usePreview } from '@/store/preview'
import { useWorkspace } from '@/store/workspace'
import { useChatBus } from '@/store/chatBus'
import { buildInspectorPrompt, findSourceHint, planSourceEdit, rgbToHex, type QuickEdit } from '@/core/runtime/inspectorEdit'
import { toast } from '@/store/toast'
import { postToPreview } from './bridge'

const px = (v: string) => Math.round(parseFloat(v) || 0)

export function InspectorPanel() {
  const sel = usePreview((s) => s.selected)
  const set = usePreview((s) => s.set)
  const vfs = useWorkspace((s) => s.vfs)
  const [text, setText] = useState('')
  const [color, setColor] = useState('#000000')
  const [bg, setBg] = useState('#ffffff')
  const [padding, setPadding] = useState(0)
  const [radius, setRadius] = useState(0)
  const [fontSize, setFontSize] = useState(16)
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!sel) return
    setText(sel.text)
    setColor(rgbToHex(sel.styles.color))
    setBg(rgbToHex(sel.styles.backgroundColor))
    setPadding(px(sel.styles.paddingTop))
    setRadius(px(sel.styles.borderRadius))
    setFontSize(px(sel.styles.fontSize))
    setDirty(new Set())
  }, [sel?.selector])

  if (!sel || !vfs) return null
  const live = (key: string, styles: Record<string, string> = {}, extra: Record<string, unknown> = {}) => {
    setDirty((d) => new Set(d).add(key))
    postToPreview(null, { type: 'inspect:apply', selector: sel.selector, styles, ...extra })
  }
  const edit: QuickEdit = {
    ...(dirty.has('text') ? { text } : {}), ...(dirty.has('color') ? { color } : {}), ...(dirty.has('bg') ? { bg } : {}),
    ...(dirty.has('padding') ? { padding } : {}), ...(dirty.has('radius') ? { radius } : {}), ...(dirty.has('fontSize') ? { fontSize } : {}),
  }
  const hint = findSourceHint(vfs.textFiles(), sel)

  const save = async () => {
    const plan = planSourceEdit(vfs.textFiles(), sel, edit)
    if (Object.keys(plan.files).length) {
      await vfs.checkpoint('Before visual edit', 'auto')
      await vfs.writeMany(plan.files, { actor: 'user' })
      await vfs.checkpoint(`Visual edit: <${sel.tag}>`, 'manual')
    }
    if (plan.applied.length) toast.success('Saved to source', plan.applied.join('\n'))
    if (plan.failed.length) toast.error('Some edits were not saved', plan.failed.join('\n'))
    if (!plan.applied.length && !plan.failed.length) toast.info('Nothing to save', 'Change a value first.')
    if (plan.applied.length) set({ selected: null })
  }
  const askAi = () => {
    useChatBus.getState().setDraft(buildInspectorPrompt(sel, hint))
    set({ selected: null, inspectMode: false })
  }

  const num = (label: string, v: number, setV: (n: number) => void, key: string, apply: (n: number) => Record<string, string>) => (
    <div><Label>{label}</Label><Input type="number" min={0} value={v} onChange={(e) => { const n = Number(e.target.value) || 0; setV(n); live(key, apply(n)) }} className="h-8 text-xs" /></div>
  )

  return (
    <div className="animate-pop absolute bottom-3 right-3 z-20 max-h-[calc(100%-1.5rem)] w-72 overflow-auto rounded-2xl border border-line bg-panel p-3 shadow-pop">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold"><MousePointerClick size={13} className="text-accent" />&lt;{sel.tag}&gt; <span className="font-mono text-[10px] font-normal text-faint">{sel.rect.w}×{sel.rect.h}</span></p>
          {sel.classes && <p className="mt-0.5 line-clamp-2 break-all font-mono text-[10px] text-muted">{sel.classes}</p>}
          {hint && <p className="mt-0.5 font-mono text-[10px] text-faint">{hint.path}:{hint.line}</p>}
        </div>
        <button onClick={() => set({ selected: null })} className="text-faint hover:text-fg" aria-label="Close inspector"><X size={14} /></button>
      </div>
      <div className="space-y-2.5">
        {sel.editableText && <div><Label>Text</Label><Input value={text} onChange={(e) => { setText(e.target.value); live('text', {}, { text: e.target.value }) }} className="h-8 text-xs" /></div>}
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Text color</Label><input type="color" value={color} onChange={(e) => { setColor(e.target.value); live('color', { color: e.target.value }) }} className="h-8 w-full cursor-pointer rounded-lg border border-line bg-subtle p-0.5" aria-label="Text color" /></div>
          <div><Label>Background</Label><input type="color" value={bg} onChange={(e) => { setBg(e.target.value); live('bg', { backgroundColor: e.target.value }) }} className="h-8 w-full cursor-pointer rounded-lg border border-line bg-subtle p-0.5" aria-label="Background color" /></div>
          {num('Padding px', padding, setPadding, 'padding', (n) => ({ padding: `${n}px` }))}
          {num('Radius px', radius, setRadius, 'radius', (n) => ({ borderRadius: `${n}px` }))}
          {num('Font size px', fontSize, setFontSize, 'fontSize', (n) => ({ fontSize: `${n}px` }))}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="primary" className="flex-1" disabled={!dirty.size} onClick={save}><Save size={13} />Save to source</Button>
        <Button size="sm" variant="accent" className="flex-1" onClick={askAi}><Sparkles size={13} />Edit with AI</Button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-faint">Edits preview instantly. “Save to source” rewrites the matching Tailwind classes / text when they can be located unambiguously.</p>
    </div>
  )
}
