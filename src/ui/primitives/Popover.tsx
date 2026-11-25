import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { autoUpdate, flip, offset, shift, size, useDismiss, useFloating, useInteractions, type Placement } from '@floating-ui/react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useMedia } from '@/lib/useMedia'

export interface MenuItem {
  label?: string
  icon?: ReactNode
  hint?: string
  onSelect?: () => void
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  checked?: boolean
}

interface DropdownProps {
  trigger: ReactNode
  items?: MenuItem[]
  content?: (close: () => void) => ReactNode
  align?: 'start' | 'end'
  className?: string
  width?: number
  triggerClassName?: string
  /** Render as a bottom-sheet drawer below 640px instead of an anchored popover. */
  mobileSheet?: boolean
  /** Accessible title for the mobile sheet. */
  sheetTitle?: string
}

/**
 * Floating-UI anchored popover rendered in a portal.
 * The position is recomputed by `autoUpdate` on every ancestor scroll / resize / layout shift, so the panel is
 * always glued to its trigger (v1.0 computed the rect once on open and drifted when any container scrolled).
 */
export function Dropdown({ trigger, items, content, align = 'start', className, width = 220, triggerClassName, mobileSheet, sheetTitle }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const phone = useMedia('(max-width: 639px)')
  const sheet = !!mobileSheet && phone
  const placement: Placement = align === 'end' ? 'bottom-end' : 'bottom-start'

  const { refs, floatingStyles, context } = useFloating({
    open: open && !sheet,
    onOpenChange: setOpen,
    placement,
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, availableWidth, elements }) {
          Object.assign(elements.floating.style, { maxHeight: `${Math.max(160, availableHeight)}px`, maxWidth: `${Math.max(200, availableWidth)}px` })
        },
      }),
    ],
  })
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true })
  const { getFloatingProps } = useInteractions([dismiss])

  useEffect(() => {
    if (!open || !sheet) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', key)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev }
  }, [open, sheet])

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-item]:not(:disabled)'))
    if (!btns.length) return
    e.preventDefault()
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    btns[e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length]?.focus()
  }

  const body = content
    ? content(close)
    : items?.map((it, i) =>
        it.separator ? (
          <div key={i} className="my-1 h-px bg-line" />
        ) : (
          <button
            key={i}
            data-item
            disabled={it.disabled}
            onClick={() => { close(); it.onSelect?.() }}
            className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors duration-150 hover:bg-subtle focus:bg-subtle focus:outline-none disabled:opacity-40', it.danger ? 'text-danger' : 'text-fg')}
          >
            {it.icon && <span className="text-muted">{it.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.checked && <Check size={13} className="text-accent" />}
            {it.hint && <span className="text-[11px] text-faint">{it.hint}</span>}
          </button>
        ),
      )

  return (
    <>
      <span ref={refs.setReference} className={cn('inline-flex min-w-0', triggerClassName)} onClick={() => setOpen((o) => !o)} data-dropdown-trigger>
        {trigger}
      </span>
      {open && !sheet &&
        createPortal(
          <div
            ref={refs.setFloating}
            {...getFloatingProps({ onKeyDown: onMenuKey })}
            data-dropdown-panel
            style={{ ...floatingStyles, width, zIndex: 80 }}
            className={cn('animate-pop flex max-h-[min(70dvh,560px)] min-h-0 flex-col overflow-auto rounded-xl border border-line bg-panel p-1 shadow-pop', className)}
          >
            {body}
          </div>,
          document.body,
        )}
      {open && sheet &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex flex-col justify-end" data-dropdown-sheet role="dialog" aria-modal="true" aria-label={sheetTitle ?? 'Options'}>
            <div className="absolute inset-0 animate-fade bg-black/40 backdrop-blur-sm" onClick={close} />
            <div onKeyDown={onMenuKey} className="animate-sheet relative flex max-h-[82dvh] min-h-0 flex-col overflow-hidden rounded-t-2xl border border-b-0 border-line bg-panel pb-[env(safe-area-inset-bottom)] shadow-pop">
              <button onClick={close} aria-label="Dismiss" className="flex h-5 shrink-0 items-center justify-center"><span className="h-1 w-9 rounded-full bg-line-strong" /></button>
              <div className="flex min-h-0 flex-1 flex-col overflow-auto p-1">{body}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
