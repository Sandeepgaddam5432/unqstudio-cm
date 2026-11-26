import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { BRAND_SVGS, type BrandKey } from './brandSvgs'
import { cdnIconUrl, isBrandKey, monogramHue, monogramText, providerBrandKey } from './modelFamily'

/** Layer 3: deterministic geometric monogram badge. Always renders, never depends on the network. */
export function Monogram({ name, size = 16, accent, className }: { name: string; size?: number; accent?: string; className?: string }) {
  const hue = monogramHue(name)
  return (
    <span
      aria-hidden="true"
      data-icon-layer="monogram"
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-[5px] font-semibold leading-none text-white', className)}
      style={{ width: size, height: size, fontSize: Math.max(7, Math.round(size * 0.42)), letterSpacing: '-0.02em', background: accent ?? `hsl(${hue} 42% 40%)` }}
    >
      {monogramText(name)}
    </span>
  )
}

export function BrandGlyph({ brand, size = 16, className, accent }: { brand: BrandKey; size?: number; className?: string; accent?: string }) {
  return (
    <svg
      data-icon-layer="svg" data-brand={brand} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" focusable="false"
      className={cn('shrink-0 text-fg', className)} style={{ width: size, height: size, color: accent }}
      dangerouslySetInnerHTML={{ __html: BRAND_SVGS[brand] }}
    />
  )
}

const ok = new Map<string, boolean>() // url → loaded? (session memo: a failed URL is never retried)
function preload(url: string): Promise<boolean> {
  const hit = ok.get(url)
  if (hit !== undefined) return Promise.resolve(hit)
  return new Promise((res) => {
    if (typeof Image === 'undefined') return res(false)
    const img = new Image()
    const done = (v: boolean) => { ok.set(url, v && img.naturalWidth > 0); res(ok.get(url)!) }
    img.onload = () => done(true)
    img.onerror = () => done(false)
    img.src = url
  })
}

/** Layer 2: first candidate that PRELOADS successfully is shown; a broken <img> can never reach the DOM. */
function useWorkingImage(urls: string[]): string | null {
  const key = urls.join('|')
  const [found, setFound] = useState<{ key: string; url: string | null }>({ key: '', url: null })
  useEffect(() => {
    let live = true
    void (async () => {
      for (const u of key.split('|').filter(Boolean)) if (await preload(u)) { if (live) setFound({ key, url: u }); return }
      if (live) setFound({ key, url: null })
    })()
    return () => { live = false }
  }, [key])
  return found.key === key ? found.url : null
}

export interface ProviderIconProps {
  id: string
  name?: string
  /** Directory-supplied logo URL (tried after the CDN glyph). */
  logo?: string
  /** Explicit brand glyph (custom providers choose a preset). */
  brand?: string
  /** Accent colour (custom providers). */
  accent?: string
  size?: number
  className?: string
}

/**
 * Provider icon with a guaranteed-non-broken 3-layer fallback:
 *   1. bundled crisp SVG glyph (instant, offline)  2. preloaded CDN SVG / directory logo  3. deterministic monogram badge.
 */
export function ProviderIcon({ id, name, logo, brand, accent, size = 16, className }: ProviderIconProps) {
  const key = isBrandKey(brand) ? brand : providerBrandKey(id)
  const remote = useWorkingImage(key ? [] : [cdnIconUrl(id), ...(logo ? [logo] : [])])
  if (key) return <BrandGlyph brand={key} size={size} className={className} accent={accent} />
  if (remote) return <img data-icon-layer="cdn" src={remote} alt="" width={size} height={size} loading="lazy" decoding="async" className={cn('shrink-0 dark:invert', className)} style={{ width: size, height: size }} />
  return <Monogram name={name || id} size={size} accent={accent} className={className} />
}
