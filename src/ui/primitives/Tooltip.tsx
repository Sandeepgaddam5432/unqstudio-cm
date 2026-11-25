import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Tooltip({ label, children, side = 'bottom', hint }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom'; hint?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const show = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect()
      if (r) setPos({ x: r.left + r.width / 2, y: side === 'bottom' ? r.bottom + 8 : r.top - 8 })
    }, 350)
  }
  const hide = () => {
    clearTimeout(timer.current)
    setPos(null)
  }
  return (
    <>
      <span ref={ref} className="inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onClick={hide}>
        {children}
      </span>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: 'fixed', left: pos.x, top: pos.y, transform: `translate(-50%, ${side === 'top' ? '-100%' : '0'})`, zIndex: 90 }}
            className="animate-fade pointer-events-none flex items-center gap-2 rounded-md border border-line bg-fg px-2 py-1 text-[11px] font-medium text-bg shadow-pop"
          >
            {label}
            {hint && <kbd className="rounded bg-bg/15 px-1 font-mono text-[10px] opacity-80">{hint}</kbd>}
          </div>,
          document.body,
        )}
    </>
  )
}
