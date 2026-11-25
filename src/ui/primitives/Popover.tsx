import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

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
}

/** Anchored popover rendered in a portal with viewport-aware placement. */
export function Dropdown({ trigger, items, content, align = 'start', className, width = 220, triggerClassName }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null)
  const close = useCallback(() => setOpen(false), [])

  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const r = anchor.current.getBoundingClientRect()
    const w = Math.min(width, window.innerWidth - 16)
    let left = align === 'end' ? r.right - w : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    const spaceBelow = window.innerHeight - r.bottom - 12
    const spaceAbove = r.top - 12
    const below = spaceBelow >= 200 || spaceBelow >= spaceAbove
    const maxH = Math.max(160, below ? spaceBelow : spaceAbove)
    setPos({ left, top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - Math.min(maxH, panel.current?.offsetHeight ?? maxH)), maxH })
  }, [open, align, width])

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const resize = () => setOpen(false)
    document.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    window.addEventListener('resize', resize)
    return () => {
      document.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
      window.removeEventListener('resize', resize)
    }
  }, [open])

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const btns = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button[data-item]:not(:disabled)') ?? [])
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    const n = e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length
    btns[n]?.focus()
  }

  return (
    <>
      <span ref={anchor} className={cn('inline-flex', triggerClassName)} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </span>
      {open &&
        createPortal(
          <div
            ref={panel}
            onKeyDown={onMenuKey}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, maxHeight: pos?.maxH, zIndex: 80 }}
            className={cn('animate-pop overflow-auto rounded-xl border border-line bg-panel p-1 shadow-pop', className)}
          >
            {content
              ? content(close)
              : items?.map((it, i) =>
                  it.separator ? (
                    <div key={i} className="my-1 h-px bg-line" />
                  ) : (
                    <button
                      key={i}
                      data-item
                      disabled={it.disabled}
                      onClick={() => {
                        close()
                        it.onSelect?.()
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-subtle focus:bg-subtle focus:outline-none disabled:opacity-40',
                        it.danger ? 'text-danger' : 'text-fg',
                      )}
                    >
                      {it.icon && <span className="text-muted">{it.icon}</span>}
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.checked && <Check size={13} className="text-accent" />}
                      {it.hint && <span className="font-mono text-[10px] text-faint">{it.hint}</span>}
                    </button>
                  ),
                )}
          </div>,
          document.body,
        )}
    </>
  )
}
