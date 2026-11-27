import { useId } from 'react'
import { resolvePreset, useTheme } from '@/store/theme'
import { cn } from '@/lib/cn'

/**
 * Crisp layered SVG Aurora (DOCS/09 §5). Oversized radial-gradient ellipses — no CSS `filter: blur()` — masked at the top
 * with `linear-gradient(to bottom, transparent 0%, #000 5%)` and clipped to the hero container by `overflow-hidden`.
 */
export function AuroraBackdrop({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  const bg = useTheme((s) => s.bg)
  const custom = useTheme((s) => s.custom)
  const p = resolvePreset(bg, custom)
  const mask = 'linear-gradient(to bottom, transparent 0%, #000 5%)'
  const stop = (c: string, o: number) => <><stop offset="0%" stopColor={c} stopOpacity={o} /><stop offset="100%" stopColor={c} stopOpacity={0} /></>
  return (
    <div aria-hidden data-aurora data-aurora-preset={p.id} className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} style={{ WebkitMaskImage: mask, maskImage: mask }}>
      <svg className="absolute left-1/2 top-0 h-full min-h-[420px] w-[180%] max-w-none -translate-x-1/2 opacity-[.55] dark:opacity-[.38]" viewBox="0 0 1600 800" preserveAspectRatio="xMidYMin slice" focusable="false">
        <defs>
          <radialGradient id={`${id}a`}>{stop(p.a, 0.9)}</radialGradient>
          <radialGradient id={`${id}b`}>{stop(p.b, 0.85)}</radialGradient>
          <radialGradient id={`${id}c`}>{stop(p.c, 0.7)}</radialGradient>
        </defs>
        <ellipse cx="420" cy="140" rx="620" ry="360" fill={`url(#${id}a)`} />
        <ellipse cx="1180" cy="120" rx="560" ry="330" fill={`url(#${id}b)`} />
        <ellipse cx="800" cy="560" rx="760" ry="300" fill={`url(#${id}c)`} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-base to-transparent" />
    </div>
  )
}
