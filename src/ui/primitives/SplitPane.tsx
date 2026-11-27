import { useCallback, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface Props {
  direction?: 'horizontal' | 'vertical'
  initial?: number
  min?: number
  max?: number
  storageKey?: string
  first: ReactNode
  second: ReactNode
  className?: string
  /** Pixel clamps for the first pane (applied on top of the min/max fractions). */
  minPx?: number
  maxPx?: number
  /** v3.1 inset canvas: second pane floats in an 8px depth gutter with 16px radius, hairline border and xl shadow. */
  inset?: boolean
}

/** Resizable two-pane split. `initial` is the fraction (0..1) given to the first pane. */
export function SplitPane({ direction = 'horizontal', initial = 0.5, min = 0.12, max = 0.88, storageKey, first, second, className, minPx, maxPx, inset }: Props) {
  const key = storageKey ? `unq.split.${storageKey}` : null
  const [ratio, setRatio] = useState(() => {
    if (key) {
      const v = Number(localStorage.getItem(key))
      if (v > 0 && v < 1) return v
    }
    return initial
  })
  const box = useRef<HTMLDivElement>(null)
  const horizontal = direction === 'horizontal'

  const onMove = useCallback(
    (e: PointerEvent) => {
      const r = box.current?.getBoundingClientRect()
      if (!r) return
      const v = horizontal ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height
      const lo = minPx ? Math.max(min, minPx / (horizontal ? r.width : r.height)) : min
      const hi = maxPx ? Math.min(max, maxPx / (horizontal ? r.width : r.height)) : max
      setRatio(Math.min(hi, Math.max(lo, v)))
    },
    [horizontal, min, max, minPx, maxPx],
  )

  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    document.body.style.userSelect = 'none'
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
    box.current?.classList.add('pointer-events-none-children')
    const up = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      box.current?.classList.remove('pointer-events-none-children')
      setRatio((r) => {
        if (key) localStorage.setItem(key, String(r))
        return r
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', up)
  }

  const onKey = (e: React.KeyboardEvent) => {
    const d = horizontal ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
    if (!d.includes(e.key)) return
    e.preventDefault()
    setRatio((r) => Math.min(max, Math.max(min, r + (e.key === d[0] ? -0.02 : 0.02))))
  }

  return (
    <div ref={box} className={cn('flex h-full w-full min-h-0 min-w-0', inset && 'bg-depth', horizontal ? 'flex-row' : 'flex-col', className)}>
      <div style={{ flexBasis: `${ratio * 100}%`, minWidth: minPx && horizontal ? minPx : undefined, maxWidth: maxPx && horizontal ? maxPx : undefined }} data-split-first className={cn('min-h-0 min-w-0 shrink-0 grow-0 overflow-hidden [.pointer-events-none-children_&_iframe]:pointer-events-none', inset && 'bg-base')}>
        {first}
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        onPointerDown={start}
        onKeyDown={onKey}
        onDoubleClick={() => setRatio(initial)}
        className={cn(
          'group relative z-10 shrink-0 bg-border-depth transition-colors hover:bg-accent/60 focus:bg-accent/60 focus:outline-none',
          horizontal ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
        )}
      >
        <span className={cn('absolute', horizontal ? '-inset-x-[4px] inset-y-0' : '-inset-y-[4px] inset-x-0')} />
      </div>
      <div data-split-second className={cn('min-h-0 min-w-0 flex-1 overflow-hidden [.pointer-events-none-children_&_iframe]:pointer-events-none', inset && 'p-2 pl-2')}>{inset ? <div data-inset-frame className="h-full min-h-0 w-full overflow-hidden rounded-2xl border border-border-depth bg-primary shadow-xl-surface">{second}</div> : second}</div>
    </div>
  )
}
