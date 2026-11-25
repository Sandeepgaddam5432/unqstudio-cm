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
}

/** Resizable two-pane split. `initial` is the fraction (0..1) given to the first pane. */
export function SplitPane({ direction = 'horizontal', initial = 0.5, min = 0.12, max = 0.88, storageKey, first, second, className }: Props) {
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
      setRatio(Math.min(max, Math.max(min, v)))
    },
    [horizontal, min, max],
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
    <div ref={box} className={cn('flex h-full w-full min-h-0 min-w-0', horizontal ? 'flex-row' : 'flex-col', className)}>
      <div style={{ flexBasis: `${ratio * 100}%` }} className="min-h-0 min-w-0 shrink-0 grow-0 overflow-hidden [.pointer-events-none-children_&_iframe]:pointer-events-none">
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
          'group relative z-10 shrink-0 bg-line transition-colors hover:bg-accent/60 focus:bg-accent/60 focus:outline-none',
          horizontal ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
        )}
      >
        <span className={cn('absolute', horizontal ? '-inset-x-1.5 inset-y-0' : '-inset-y-1.5 inset-x-0')} />
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden [.pointer-events-none-children_&_iframe]:pointer-events-none">{second}</div>
    </div>
  )
}
