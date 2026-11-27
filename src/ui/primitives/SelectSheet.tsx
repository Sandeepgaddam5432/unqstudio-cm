import { useCallback, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { autoUpdate, flip, offset, shift, size, useDismiss, useFloating, useInteractions } from '@floating-ui/react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useMedia } from '@/lib/useMedia'
import { BottomSheet } from './BottomSheet'

export interface SelectOption<T extends string = string> { value: T; label: ReactNode; hint?: string; group?: string; disabled?: boolean; icon?: ReactNode }

export interface SelectSheetProps<T extends string = string> {
  value: T
  onChange: (v: T) => void
  options: SelectOption<T>[]
  'aria-label': string
  title?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Panel width (desktop popover). Defaults to the trigger width (min 200). */
  width?: number
}

function OptionList<T extends string>({ options, value, pick }: { options: SelectOption<T>[]; value: T; pick: (v: T) => void }) {
  const groups: { name: string; items: SelectOption<T>[] }[] = []
  for (const o of options) {
    const name = o.group ?? ''
    const g = groups.find((x) => x.name === name)
    if (g) g.items.push(o); else groups.push({ name, items: [o] })
  }
  return (
    <div role="listbox" className="flex flex-col gap-0.5 p-1.5" data-select-list>
      {groups.map((g) => (
        <div key={g.name} className="flex flex-col gap-0.5">
          {g.name && <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">{g.name}</p>}
          {g.items.map((o) => {
            const on = o.value === value
            return (
              <button key={o.value} role="option" aria-selected={on} data-select-option={o.value} disabled={o.disabled} onClick={() => pick(o.value)}
                className={cn('press flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3 text-left text-[14px] transition-colors hover:bg-fg/5 focus:bg-fg/5 focus:outline-none disabled:opacity-40 md:min-h-[34px] md:text-[13px]', on && 'bg-accent/10 font-medium')}>
                {o.icon && <span className="shrink-0">{o.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-[11px] text-faint">{o.hint}</span>}
                {on && <Check size={14} className="shrink-0 text-accent" />}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * Custom glassy select — replaces every native OS `<select>`.
 * Desktop/tablet: Floating-UI popover. Phone (<640px): bottom sheet with swipe-to-dismiss.
 */
export function SelectSheet<T extends string = string>({ value, onChange, options, title, placeholder = 'Select…', className, disabled, width, ...rest }: SelectSheetProps<T>) {
  const [open, setOpen] = useState(false)
  const phone = useMedia('(max-width: 639px)')
  const close = useCallback(() => setOpen(false), [])
  const { refs, floatingStyles, context } = useFloating({
    open: open && !phone, onOpenChange: setOpen, placement: 'bottom-start', strategy: 'fixed', transform: false, whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 }), size({ padding: 8, apply({ availableHeight, rects, elements }) { Object.assign(elements.floating.style, { maxHeight: `${Math.max(160, Math.min(360, availableHeight))}px`, minWidth: `${Math.max(200, rects.reference.width)}px` }) } })],
  })
  const { getFloatingProps } = useInteractions([useDismiss(context, { outsidePress: true, escapeKey: true })])
  const cur = options.find((o) => o.value === value)
  const pick = (v: T) => { onChange(v); close() }
  const label = rest['aria-label']
  return (
    <>
      <button ref={refs.setReference} type="button" disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open} data-select-trigger onClick={() => setOpen((o) => !o)}
        className={cn('press glass-field flex h-9 min-w-0 items-center justify-between gap-2 rounded-xl px-3 text-left text-[13px] text-fg disabled:opacity-50', className)}>
        <span className={cn('min-w-0 flex-1 truncate', !cur && 'text-faint')}>{cur?.label ?? placeholder}</span>
        <ChevronDown size={14} className={cn('shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && !phone && createPortal(
        <div ref={refs.setFloating} {...getFloatingProps()} data-select-panel style={{ ...floatingStyles, width, zIndex: 95 }} className="glass-pop animate-pop flex min-h-0 flex-col overflow-y-auto rounded-2xl">
          <OptionList options={options} value={value} pick={pick} />
        </div>, document.body)}
      {open && phone && (
        <BottomSheet open onClose={close} title={title ?? label} flush>
          <div data-select-sheet><OptionList options={options} value={value} pick={pick} /></div>
        </BottomSheet>
      )}
    </>
  )
}
