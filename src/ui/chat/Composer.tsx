import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, AtSign, BookText, Check, ChevronDown, FileCode2, ImagePlus, Mic, MicOff, Plus, Square, Undo2, Wand2, X } from 'lucide-react'
import { Button, Dropdown, Segmented, Spinner, Textarea, Tooltip, type MenuItem } from '@/ui/primitives'
import { ModelPill } from './ModelPill'
import { useSpeech } from './useSpeech'
import { useSettings, type AIMode } from '@/store/settings'
import { activeConfig } from '@/store/aiConfig'
import { useApp } from '@/store/app'
import { useVault } from '@/store/vault'
import { enhancePrompt } from '@/core/ai/orchestrator'
import { fuzzyScore } from '@/lib/fuzzy'
import { downscaleImage, ACCEPTED_IMAGE } from '@/lib/image'
import { fileToDataUrl } from '@/lib/util'
import { toast } from '@/store/toast'
import { cn } from '@/lib/cn'

const MODE_LABEL: Record<AIMode, string> = { build: 'Build', ask: 'Chat', plan: 'Plan' }
const HERO_MODES: { id: AIMode; label: string; desc: string; free?: boolean }[] = [
  { id: 'build', label: 'Build', desc: 'Make changes directly' },
  { id: 'ask', label: 'Chat', desc: 'Ask anything, explore ideas', free: true },
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
}

export function Composer({ value, onChange, images, onImages, onSubmit, busy, onStop, mode, onMode, placeholder, mentionPaths, variant = 'chat', autoFocus, submitIcon, allowEmptySubmit, submitLabel, plusItems }: ComposerProps) {
  const area = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [enhancing, setEnhancing] = useState(false)
  const [prev, setPrev] = useState<string | null>(null)
  const [caret, setCaret] = useState(0)
  const [sel, setSel] = useState(0)
  const [drag, setDrag] = useState(false)
  const prompts = useSettings((s) => s.customPrompts)
  const setSettings = useSettings((s) => s.set)
  const speech = useSpeech((t) => onChange(value + (value && !value.endsWith(' ') ? ' ' : '') + t))
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
    if (mention && mention.items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % mention.items.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + mention.items.length) % mention.items.length); return }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); pickMention(mention.items[sel]); return }
      if (e.key === 'Escape') { e.preventDefault(); onChange(value + ' '); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!busy && (value.trim() || allowEmptySubmit)) onSubmit()
    }
  }

  const hero = variant === 'hero'
  return (
    <div
      className={cn('relative min-w-0 transition-colors duration-150', hero ? 'composer-gradient rounded-[28px] p-3 backdrop-blur-xl' : 'rounded-2xl border bg-panel p-2', !hero && (drag ? 'border-accent' : 'border-line focus-within:border-line-strong'), hero && drag && 'ring-2 ring-accent')}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files) }}
    >
      {mention && mention.items.length > 0 && (
        <div className="animate-pop absolute inset-x-2 bottom-full z-30 mb-2 overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-pop" role="listbox">
          {mention.items.map((p, i) => (
            <button key={p} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); pickMention(p) }} className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono text-xs', i === sel && 'bg-subtle')}>
              <FileCode2 size={13} className="text-muted" />{p}
            </button>
          ))}
        </div>
      )}
      {images.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {images.map((src, i) => (
            <div key={i} className="group relative h-14 w-14 overflow-hidden rounded-lg border border-line">
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
        onChange={(e) => { onChange(e.target.value); setCaret(e.target.selectionStart); setSel(0) }}
        onKeyUp={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onClick={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyDown={onKeyDown}
        onPaste={(e) => { const fs = Array.from(e.clipboardData.files).filter((f) => ACCEPTED_IMAGE.test(f.type)); if (fs.length) { e.preventDefault(); void addFiles(fs) } }}
        placeholder={placeholder}
        aria-label="Message"
        className={cn('border-0 bg-transparent px-2 hover:border-0 focus:border-0', hero ? 'min-h-[60px] text-[16px]' : 'min-h-[38px] text-[13.5px]')}
      />
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = '' }} />
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5" data-composer-toolbar>
        <div className="flex min-w-0 flex-wrap items-center gap-0.5">
          {hero ? (
            <Dropdown align="start" width={240} mobileSheet sheetTitle="Add to your prompt" trigger={<Button variant="ghost" size="icon" aria-label="Add" data-composer-plus className="rounded-full"><Plus size={18} /></Button>}
              items={[{ label: 'Attach', hint: 'Image or screenshot', icon: <ImagePlus size={14} />, onSelect: () => file.current?.click() }, ...(plusItems ?? [])]} />
          ) : (
            <Tooltip label="Attach image (screenshot-to-code)" side="top"><Button variant="ghost" size="icon-sm" onClick={() => file.current?.click()} aria-label="Attach image"><ImagePlus size={15} /></Button></Tooltip>
          )}
          {mentionPaths && (
            <Tooltip label="Mention a file (@)" side="top"><Button variant="ghost" size="icon-sm" aria-label="Mention file" onClick={() => {
              const el = area.current; const pos = el?.selectionStart ?? value.length; const before = value.slice(0, pos)
              const ins = (before && !/\s$/.test(before) ? ' ' : '') + '@'
              onChange(before + ins + value.slice(pos)); setCaret(pos + ins.length); setSel(0)
              requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + ins.length, pos + ins.length) })
            }}><AtSign size={15} /></Button></Tooltip>
          )}
          <Tooltip label={speech.supported ? (speech.listening ? 'Stop dictation' : 'Voice input') : 'Voice input is not supported in this browser (try Chrome, Edge or Safari)'} side="top">
            <Button variant="ghost" size="icon-sm" disabled={!speech.supported} onClick={() => { speech.toggle(); if (speech.error) toast.error(speech.error) }} aria-label="Voice input" className={cn(speech.listening && 'text-danger')}>
              {speech.supported ? <Mic size={15} className={cn(speech.listening && 'animate-pulse-soft')} /> : <MicOff size={15} />}
            </Button>
          </Tooltip>
          <Tooltip label="Enhance prompt ✨" side="top"><Button variant="ghost" size="icon-sm" className={cn(hero && 'max-sm:hidden')} disabled={!value.trim() || enhancing} onClick={enhance} aria-label="Enhance prompt">{enhancing ? <Spinner size={14} /> : <Wand2 size={15} />}</Button></Tooltip>
          {prev !== null && <Button variant="ghost" size="xs" onClick={() => { onChange(prev); setPrev(null) }}><Undo2 size={11} />Revert</Button>}
          {!hero && (
            <Dropdown
              width={280}
              trigger={<Button variant="ghost" size="icon-sm" aria-label="Rules library"><BookText size={15} /></Button>}
              content={() => (
                <div className="p-1">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">Rules library</div>
                  {prompts.length === 0 && <p className="px-2 py-2 text-xs text-muted">No saved rules yet. Add reusable system prompts in Settings → Prompts.</p>}
                  {prompts.map((p) => (
                    <button key={p.id} onClick={() => setSettings({ customPrompts: prompts.map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled } : x)) })} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-subtle">
                      <span className={cn('flex h-4 w-4 items-center justify-center rounded border', p.enabled ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong')}>{p.enabled && <Check size={11} />}</span>
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                  <button onClick={() => useApp.getState().openSettings('prompts')} className="mt-1 w-full rounded-lg border-t border-line px-2 py-1.5 text-left text-xs text-muted hover:text-fg">Manage rules…</button>
                </div>
              )}
            />
          )}
          {mode && onMode && hero && (
            <Dropdown align="start" width={288} mobileSheet sheetTitle="Mode" triggerClassName="ml-auto" trigger={<Button variant="ghost" size="sm" aria-label="Mode" data-mode-trigger className="gap-1 rounded-full">{MODE_LABEL[mode]}<ChevronDown size={13} /></Button>}
              content={(close) => (
                <div className="p-1" role="menu" data-mode-menu>
                  {HERO_MODES.map((m) => (
                    <button key={m.id} role="menuitemradio" aria-checked={mode === m.id} onClick={() => { onMode(m.id); close() }} className="flex min-h-[48px] w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-depth">
                      <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[14px] font-medium">{m.label}{m.free && <span className="rounded-full bg-depth px-1.5 py-px text-[10px] font-medium text-fg-secondary">Free</span>}</span><span className="t-meta block text-fg-tertiary">{m.desc}</span></span>
                      {mode === m.id && <Check size={14} className="mt-1 text-accent" />}
                    </button>
                  ))}
                </div>
              )} />
          )}
          {mode && onMode && !hero && (
            <Segmented<AIMode> size="sm" className="ml-1" value={mode} onChange={onMode} items={[{ id: 'build', label: 'Build' }, { id: 'plan', label: 'Plan' }, { id: 'ask', label: 'Ask' }]} />
          )}
        </div>
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
          <ModelPill align="end" />
          {busy ? (
            <Button variant="primary" size="icon" onClick={onStop} aria-label="Stop generating" className="rounded-full"><Square size={13} fill="currentColor" /></Button>
          ) : (
            hero ? (
              <button onClick={onSubmit} disabled={!value.trim() && !allowEmptySubmit} aria-label={submitLabel ?? 'Send'} data-hero-send className="press flex h-9 w-9 items-center justify-center rounded-full bg-fg-primary text-base disabled:opacity-40">{submitIcon ?? <ArrowUp size={17} />}</button>
            ) : <Button variant="accent" size="icon" onClick={onSubmit} disabled={!value.trim() && !allowEmptySubmit} aria-label={submitLabel ?? 'Send'} className="rounded-full">{submitIcon ?? <ArrowUp size={17} />}</Button>
          )}
        </div>
      </div>
    </div>
  )
}
