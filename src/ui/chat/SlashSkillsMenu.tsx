import { useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import type { SkillChoice } from '@/core/skills'
import { cn } from '@/lib/cn'

/** Floating `/` popover above the composer: built-in + installed Skills, filterable, keyboard & touch selectable. */
export function SlashSkillsMenu({ items, sel, onSel, onPick }: { items: SkillChoice[]; sel: number; onSel: (i: number) => void; onPick: (s: SkillChoice) => void }) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => { list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }) }, [sel])
  return (
    <div data-slash-menu className="glass-pop animate-pop absolute inset-x-1 bottom-full z-30 mb-2 overflow-hidden rounded-2xl">
      <p className="px-3 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-quaternary">Skills</p>
      <div ref={list} role="listbox" aria-label="Skills" className="sheet-scroll max-h-[min(40dvh,280px)] overflow-y-auto p-1 pt-0">
        {items.length === 0 && <p className="px-3 py-3 text-xs text-muted">No skills match. Add your own in Account → Personalization → Skills.</p>}
        {items.map((s, i) => (
          <button key={s.id} role="option" aria-selected={i === sel} data-skill-option={s.id} onMouseEnter={() => onSel(i)} onPointerDown={(e) => { e.preventDefault(); onPick(s) }}
            className={cn('flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left', i === sel && 'bg-fg/5')}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent"><Sparkles size={14} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{s.name}</span><span className="block truncate text-[11.5px] text-fg-tertiary">{s.description}</span></span>
            {s.builtin && <span className="shrink-0 rounded-full bg-fg/5 px-2 py-0.5 text-[10px] text-fg-tertiary">Built-in</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
