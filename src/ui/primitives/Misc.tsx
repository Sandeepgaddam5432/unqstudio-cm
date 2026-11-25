import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin-fast', className)} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-subtle px-1.5 py-px font-mono text-[10px] text-muted">{children}</kbd>
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warn'; className?: string }) {
  const tones = {
    neutral: 'bg-subtle text-muted border-line',
    accent: 'bg-accent/10 text-accent border-accent/25',
    success: 'bg-success/10 text-success border-success/25',
    danger: 'bg-danger/10 text-danger border-danger/25',
    warn: 'bg-warn/10 text-warn border-warn/25',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-[10px] font-medium', tones[tone], className)}>{children}</span>
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-xs text-xs text-muted">{children}</div>}
    </div>
  )
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-fg" />
      <path d="M9 8v10a7 7 0 0 0 14 0V8" fill="none" className="stroke-bg" strokeWidth="3" strokeLinecap="round" />
      <circle cx="23" cy="23" r="2.6" className="fill-accent" />
    </svg>
  )
}

export function Section({ title, description, children, right }: { title: string; description?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}
