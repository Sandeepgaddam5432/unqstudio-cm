/** WCAG helpers for the responsive/a11y audit: contrast ratios, AA/AAA verdicts, touch-target and label rules. */
export type RGB = [number, number, number]
export function parseColor(c: string): RGB | null {
  const s = c.trim().toLowerCase()
  let m = /^#([0-9a-f]{3})$/.exec(s); if (m) return [...m[1]].map((h) => parseInt(h + h, 16)) as RGB
  m = /^#([0-9a-f]{6})/.exec(s); if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as RGB
  const r = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s); if (r) return [+r[1], +r[2], +r[3]]
  return null
}
const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
export const luminance = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
export function contrastRatio(fg: string, bg: string): number | null {
  const a = parseColor(fg); const b = parseColor(bg)
  if (!a || !b) return null
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}
export const wcagLevel = (ratio: number, large = false): 'AAA' | 'AA' | 'fail' => (ratio >= (large ? 4.5 : 7) ? 'AAA' : ratio >= (large ? 3 : 4.5) ? 'AA' : 'fail')
export const isLargeText = (px: number, weight: number) => px >= 24 || (px >= 18.66 && weight >= 700)
export const touchTargetOk = (w: number, h: number) => w >= 44 && h >= 44
