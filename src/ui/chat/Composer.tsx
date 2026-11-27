import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, AtSign, BookText, Check, ChevronDown, FileCode2, ImagePlus, Mic, Plus, Slash, Sparkles, Square, Undo2, Wand2, X } from 'lucide-react'
import { Button, Dropdown, Textarea, type MenuItem } from '@/ui/primitives'
import { ModelPill } from './ModelPill'
import { useVoiceInput } from './useVoiceInput'
import { SlashSkillsMenu } from './SlashSkillsMenu'
import { filterSkillChoices, skillChoices, type SkillChoice } from '@/core/skills'
import { usePrefs } from '@/store/prefs'
import { useComposerSkills } from '@/store/composerSkills'
import { type AIMode } from '@/store/settings'
import { activeConfig } from '@/store/aiConfig'
import { useApp } from '@/store/app'
import { useVault } from '@/store/vault'
import { enhancePrompt } from '@/core/ai/orchestrator'
import { fuzzyScore } from '@/lib/fuzzy'
import { downscaleImage, ACCEPTED_IMAGE } from '@/lib/image'
import { fileToDataUrl } from '@/lib/util'
import { toast } from '@/store/toast'
import { cn } from '@/lib/cn'

const MODE_LABEL: Record<AIMode, string> = { build: 'Build', ask: 'Ask', plan: 'Plan' }
const MODES: { id: AIMode; label: string; desc: string; free?: boolean }[] = [
  { id: 'build', label: 'Build', desc: 'Make changes directly' },
  { id: 'ask', label: 'Ask', desc: 'Ask anything, explore ideas', free: true },
  { id: 'plan', label: 'Plan', desc: 'Detailed spec for complex builds' },
]

export interface ComposerProps {
  value: string
  onChange: (v: string) => void
  images: string[]
  onImages: (v: string[]) => void
  onSubmit: () => void
  busy?: boolean
  onStop?: () => void
  mode?: AIMode
  onMode?: (m: AIMode) => void
  placeholder?: string
  mentionPaths?: string[]
  variant?: 'hero' | 'chat'
  autoFocus?: boolean
  submitIcon?: React.ReactNode
  allowEmptySubmit?: boolean
  submitLabel?: string
  /** Extra rows for the hero `+` menu (Import project, Add context, Databases…). */
  plusItems?: MenuItem[]
  /** Message queue: allow submitting while the agent is busy (the parent queues it). */
  queueing?: boolean
}

export function Composer({ value, onChange, images, onImages, onSubmit, busy, onStop, mode, onMode, placeholder, mentionPaths, variant = 'chat', autoFocus, submitIcon, allowEmptySubmit, submitLabel, plusItems, queueing }: ComposerProps) {
  const area = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [enhancing, setEnhancing] = useState(false)
  const [prev, setPrev] = useState<string | null>(null)
  const [caret, setCaret] = useState(0)
  const [sel, setSel] = useState(0)
  const [drag, setDrag] = useState(false)
  const [slashSel, setSlashSel] = useState(0)
  const installed = usePrefs((p) => p.skills)
  const picked = useComposerSkills((c) => c.picked)
  const voice = useVoiceInput(() => value, onChange)
  useVault((v) => v.rev)

  useEffect(() => {
    const el = area.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, variant === 'hero' ? 240 : 180) + 'px' }
  }, [value, variant])
  useEffect(() => { if (autoFocus) area.current?.focus() }, [autoFocus])

  const mention = useMemo(() => {
    if (!mentionPaths?.length) return null
    const m = /(?:^|\s)@([\w./\-[\]]*)$/.exec(value.slice(0, caret))
    if (!m) return null
    const q = m[1]
    const items = mentionPaths.filter((p) => !p.endsWith('/.keep'))
      .map((p) => ({ p, s: fuzzyScore(q, p) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.p)
    const folders = new Set<string>()
    for (const p of mentionPaths) { const d = p.slice(0, p.lastIndexOf('/')); if (d && fuzzyScore(q, d) >= 0 && q.length > 0) folders.add(d) }
    return { q, start: caret - q.length - 1, items: [...[...folders].slice(0, 2), ...items].slice(0, 8) }
  }, [value, caret, mentionPaths])

  const slash = useMemo(() => {
    const m = /(?:^|\s)\/([\w-]*)$/.exec(value.slice(0, caret))
    if (!m) return null
    return { q: m[1]!, start: caret - m[1]!.length - 1, items: filterSkillChoices(skillChoices(installed), m[1]!).slice(0, 30) }
  }, [value, caret, installed])
  const pickSkill = (sk: SkillChoice) => {
    if (!slash) return
    onChange(value.slice(0, slash.start) + value.slice(caret))
    useComposerSkills.getState().add(sk)
    setSlashSel(0)
    requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(slash.start, slash.start) })
  }
  const openSlash = () => {
    const el = area.current; const pos = el?.selectionStart ?? value.length; const before = value.slice(0, pos)
    const ins = (before && !/\s$/.test(before) ? ' ' : '') + '/'
    onChange(before + ins + value.slice(pos)); setCaret(pos + ins.length); setSlashSel(0)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + ins.length, pos + ins.length) })
  }

  const pickMention = (p: string) => {
    if (!mention) return
    const next = value.slice(0, mention.start) + '@' + p.replace(/^\//, '') + ' ' + value.slice(caret)
    onChange(next)
    setSel(0)
    requestAnimationFrame(() => { area.current?.focus(); const pos = mention.start + p.length + 1; area.current?.setSelectionRange(pos, pos) })
  }

  const addFiles = async (files: FileList | File[]) => {
    const out: string[] = []
    for (const f of Array.from(files)) {
      if (!ACCEPTED_IMAGE.test(f.type)) { toast.error('Unsupported image', 'Attach PNG, JPG or WebP files.'); continue }
      out.push(await downscaleImage(await fileToDataUrl(f)))
    }
    if (out.length) onImages([...images, ...out].slice(0, 4))
  }

  const enhance = async () => {
    if (!value.trim() || enhancing) return
    const cfg = activeConfig()
    if (cfg.error || !cfg.provider) { useApp.getState().setOnboardingOpen(true); return }
    setEnhancing(true)
    try {
      const better = await enhancePrompt({ provider: cfg.provider, model: cfg.model, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, text: value })
      if (better) { setPrev(value); onChange(better) }
    } catch (e) {
      const err = e as Error & { hint?: string }
      toast.error('Prompt enhancer failed', `${err.message}${err.hint ? ` — ${err.hint}` : ''}`)
    } finally { setEnhancing(false) }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (slash && slash.items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashSel((v) => (v + 1) % slash.items.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashSel((v) => (v - 1 + slash.items.length) % slash.items.length); return }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); pickSkill(slash.items[Math.min(slashSel, slash.items.length - 1)]!); return }
      if (e.key === 'Escape') { e.preventDefault(); onChange(value + ' '); return }
    }
    if (mention && mention.items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % mention.items.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + mention.items.length) % mention.items.length); return }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); pickMention(mention.items[sel]); return }
      if (e.key === 'Escape') { e.preventDefault(); onChange(value + ' '); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if ((!busy || queueing) && (value.trim() || allowEmptySubmit)) onSubmit()
    }
  }

  const hero = variant === 'hero'
  const modeOf = mode ?? 'build'
  const menuItems: MenuItem[] = [
    { label: 'Attach image', hint: 'Screenshot-to-code', icon: <ImagePlus size={14} />, onSelect: () => file.current?.click() },
    ...(mentionPaths ? [{ label: 'Mention a file', hint: '@', icon: <AtSign size={14} />, onSelect: () => {
      const el = area.current; const pos = el?.selectionStart ?? value.length; const before = value.slice(0, pos)
      const ins = (before && !/\s$/.test(before) ? ' ' : '') + '@'
      onChange(before + ins + value.slice(pos)); setCaret(pos + ins.length); setSel(0)
      requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + ins.length, pos + ins.length) })
    } }] : []),
    { label: 'Skills', hint: '/', icon: <Slash size={14} />, onSelect: openSlash },
    { label: enhancing ? 'Enhancing…' : 'Enhance prompt', icon: <Wand2 size={14} />, disabled: !value.trim() || enhancing, onSelect: () => void enhance() },
    { label: 'Rules library', icon: <BookText size={14} />, onSelect: () => useApp.getState().openSettings('prompts') },
    ...(plusItems ?? []),
  ]
  const canSend = !!value.trim() || !!allowEmptySubmit
  return (
    <div
      className={cn('relative min-w-0 transition-shadow duration-150', hero ? 'composer-float p-3' : 'glass rounded-[22px] p-2.5', drag && 'ring-2 ring-accent')}
      data-composer={variant}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files) }}
    >
      {slash && <SlashSkillsMenu items={slash.items} sel={Math.min(slashSel, Math.max(0, slash.items.length - 1))} onSel={setSlashSel} onPick={pickSkill} />}
      {!slash && mention && mention.items.length > 0 && (
        <div className="glass-pop animate-pop absolute inset-x-2 bottom-full z-30 mb-2 overflow-hidden rounded-2xl p-1" role="listbox">
          {mention.items.map((p, i) => (
            <button key={p} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); pickMention(p) }} className={cn('flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left font-mono text-xs', i === sel && 'bg-fg/5')}>
              <FileCode2 size={13} className="text-muted" />{p}
            </button>
          ))}
        </div>
      )}
      {(images.length > 0 || picked.length > 0 || voice.listening) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
          {picked.map((k) => (
            <span key={k.id} data-skill-pill={k.id} className="flex h-7 items-center gap-1 rounded-full bg-accent/12 pl-2.5 pr-1 text-[12px] font-medium text-accent">
              <Sparkles size={11} />{k.name}
              <button aria-label={`Remove skill ${k.name}`} onClick={() => useComposerSkills.getState().remove(k.id)} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent/15"><X size={11} /></button>
            </span>
          ))}
          {voice.listening && (
            <span data-recording className="flex h-7 items-center gap-1.5 rounded-full bg-danger/10 px-2.5 text-[12px] font-medium text-danger" role="status">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger/60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" /></span>Listening…
            </span>
          )}
          {images.map((src, i) => (
            <div key={i} className="group relative h-12 w-12 overflow-hidden rounded-xl border border-line">
              <img src={src} alt={`Attachment ${i + 1}`} className="h-full w-full object-cover" />
              <button onClick={() => onImages(images.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/70 p-0.5 text-white group-hover:block" aria-label="Remove image"><X size={11} /></button>
            </div>
          ))}
        </div>
      )}
      <Textarea
        ref={area}
        value={value}
        rows={hero ? 2 : 1}
        onChange={(e) => { onChange(e.target.value); setCaret(e.target.selectionStart); setSel(0); setSlashSel(0) }}
        onKeyUp={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onClick={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyDown={onKeyDown}
        onPaste={(e) => { const fs = Array.from(e.clipboardData.files).filter((f) => ACCEPTED_IMAGE.test(f.type)); if (fs.length) { e.preventDefault(); void addFiles(fs) } }}
        placeholder={placeholder ?? 'Ask for a change... (@ files, / skills)'}
        aria-label="Message"
        className={cn('border-0 bg-transparent px-2 hover:border-0 focus:border-0', hero ? 'min-h-[60px] text-[16px]' : 'min-h-[40px] text-[15px]')}
      />
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = '' }} />
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5" data-composer-toolbar>
        <div className="flex shrink-0 items-center gap-0.5">
          <Dropdown align="start" width={248} mobileSheet sheetTitle="Add to your prompt" items={menuItems}
            trigger={<Button variant="ghost" size="icon" aria-label="Add" data-composer-plus className="rounded-full"><Plus size={18} /></Button>} />
          <Button variant="ghost" size="icon" onClick={voice.toggle} aria-label={voice.listening ? 'Stop dictation' : 'Voice input'} aria-pressed={voice.listening} data-mic
            className={cn('rounded-full', voice.listening && 'bg-danger/12 text-danger')}>
            <Mic size={17} className={cn(voice.listening && 'animate-pulse-soft')} />
          </Button>
          {prev !== null && <Button variant="ghost" size="xs" onClick={() => { onChange(prev); setPrev(null) }}><Undo2 size={11} />Revert</Button>}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
          {onMode && (
            <Dropdown align="start" width={288} mobileSheet sheetTitle="Mode" triggerClassName="shrink-0"
              trigger={<button type="button" aria-label="Mode" data-mode-trigger className="press glass-field flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium">{MODE_LABEL[modeOf]}<ChevronDown size={13} className="text-muted" /></button>}
              content={(close) => (
                <div className="p-1" role="menu" data-mode-menu>
                  {MODES.map((m) => (
                    <button key={m.id} role="menuitemradio" aria-checked={modeOf === m.id} onClick={() => { onMode(m.id); close() }} className="flex min-h-[48px] w-full items-start gap-2 rounded-xl px-3 py-2 text-left hover:bg-fg/5">
                      <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[14px] font-medium">{m.label}{m.free && <span className="rounded-full bg-fg/5 px-1.5 py-px text-[10px] font-medium text-fg-secondary">Free</span>}</span><span className="t-meta block text-fg-tertiary">{m.desc}</span></span>
                      {modeOf === m.id && <Check size={14} className="mt-1 text-accent" />}
                    </button>
                  ))}
                </div>
              )} />
          )}
          <div className="min-w-0 max-w-[150px]"><ModelPill align="end" /></div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {busy ? (
            <>{queueing && value.trim() && <button onClick={onSubmit} aria-label="Queue message" data-queue-send className="press flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-fg"><ArrowUp size={17} /></button>}<button onClick={onStop} aria-label="Stop generating" className="press flex h-9 w-9 items-center justify-center rounded-full bg-fg-primary text-base"><Square size={13} fill="currentColor" /></button></>
          ) : (
            <button onClick={onSubmit} disabled={!canSend} aria-label={submitLabel ?? 'Send'} data-composer-send {...(hero ? { 'data-hero-send': '' } : {})} className="press flex h-9 w-9 items-center justify-center rounded-full bg-fg-primary text-base disabled:opacity-35">{submitIcon ?? <ArrowUp size={17} />}</button>
          )}
        </div>
      </div>
    </div>
  )
}
