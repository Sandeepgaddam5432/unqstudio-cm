/** Pure colour maths for the Color Studio (hex ⇄ HSV ⇄ OKLCH, WCAG contrast). No DOM. */
export interface Hsv { h: number; s: number; v: number }
export interface Oklch { l: number; c: number; h: number }

const HEX6 = /^#[0-9a-f]{6}$/i
export const isHex = (v: string): boolean => HEX6.test(v)

/** Accepts `#abc`, `abc`, `#aabbcc`, `aabbcc`; returns lower-case `#rrggbb` or null. */
export function normalizeHex(input: string): string | null {
  let s = input.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('')
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = normalizeHex(hex) ?? '#000000'
  return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16)]
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function hexToHsv(hex: string): Hsv {
  const [r8, g8, b8] = hexToRgb(hex)
  const r = r8 / 255, g = g8 / 255, b = b8 / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max }
}
export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
  return rgbToHex(f(5) * 255, f(3) * 255, f(1) * 255)
}

const toLin = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
const fromLin = (x: number) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)

export function hexToOklch(hex: string): Oklch {
  const [R, G, B] = hexToRgb(hex).map(toLin) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.hypot(a, bb)
  let h = (Math.atan2(bb, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c, h: c < 1e-4 ? 0 : h }
}
export function oklchToHex({ l, c, h }: Oklch): string {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const R = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
  const G = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
  const B = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
  return rgbToHex(fromLin(Math.max(0, R)), fromLin(Math.max(0, G)), fromLin(Math.max(0, B)))
}
export function formatOklch(hex: string): string {
  const { l, c, h } = hexToOklch(hex)
  return `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(0)})`
}
/** Parses `oklch(62% 0.2 264)` / `oklch(0.62 0.2 264)`; returns hex or null. */
export function parseOklch(input: string): string | null {
  const m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/.*)?\)$/i.exec(input.trim())
  if (!m) return null
  const l = Number(m[1]) / (m[2] ? 100 : 1), c = Number(m[3]), h = Number(m[4])
  if (![l, c, h].every(Number.isFinite) || l < 0 || l > 1) return null
  return oklchToHex({ l, c, h })
}
/** Accept hex or oklch text; returns normalised hex or null. */
export function parseColor(input: string): string | null { return normalizeHex(input) ?? parseOklch(input) }

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
}
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
export function wcagGrade(ratio: number): 'AAA' | 'AA' | 'AA Large' | 'Fail' {
  return ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA Large' : 'Fail'
}
