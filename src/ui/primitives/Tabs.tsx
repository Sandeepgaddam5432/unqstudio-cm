import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem<T extends string> {
  id: T
  label: ReactNode
  icon?: ReactNode
  badge?: ReactNode
}

export function Tabs<T extends string>({ items, value, onChange, className, size = 'md' }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className={cn('flex items-center gap-0.5 overflow-x-auto', className)}>
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap font-medium transition-colors',
            size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-10 px-3 text-[13px]',
            value === t.id ? 'text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {t.icon}
          {t.label}
          {t.badge}
          {value === t.id && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  )
}

/** Apple-style segmented control. */
export function Segmented<T extends string>({ items, value, onChange, className, size = 'md' }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-lg border border-line bg-subtle p-0.5', className)}>
      {items.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-200',
            size === 'sm' ? 'h-6 px-2.5 text-[11px]' : 'h-7 px-3 text-xs',
            value === t.id ? 'bg-panel text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}
