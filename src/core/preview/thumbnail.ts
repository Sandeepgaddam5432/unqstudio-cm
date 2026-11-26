import type { IStorageAdapter } from '@/core/vfs/types'

/** Layout snapshot produced inside the preview iframe by the bridge (`thumb:capture`). */
export interface ThumbBox { x: number; y: number; w: number; h: number; bg: string; color: string; fs: number; fw: string; r: number; t: string }
export interface ThumbSnapshot { w: number; h: number; bg: string; boxes: ThumbBox[] }

/** Hard cap for a stored thumbnail data URL (kept small: it lives inside every project record). */
export const MAX_THUMB_CHARS = 40_000
const IMG_URL = /^data:image\/(webp|jpeg|png|svg\+xml);base64,[A-Za-z0-9+/=]+$/
const COLOR = /^rgba?\(\s*[\d.]+(?:\s*,\s*[\d.]+){2,3}\s*\)$/
const TW = 320
const TH = 200

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!)
const color = (c: string, fallback = '') => (COLOR.test(c) ? c : fallback)

export function toDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/svg+xml;base64,${btoa(bin)}`
}

/** Accept only compact image data URLs; anything bigger than the cap (or not an image) is rejected. */
export function capThumbnail(url: string | undefined | null, max = MAX_THUMB_CHARS): string | undefined {
  if (!url || url.length > max || !IMG_URL.test(url)) return undefined
  return url
}

/** Deterministic gradient + initial, used when no live capture is possible (headless / restricted contexts). */
export function fallbackThumbnail(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  const initial = esc((name.trim()[0] ?? '?').toUpperCase())
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TW} ${TH}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,58%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},70%,38%)"/></linearGradient></defs><rect width="${TW}" height="${TH}" fill="url(#g)"/><text x="${TW / 2}" y="${TH / 2 + 28}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="84" font-weight="700" fill="rgba(255,255,255,.85)">${initial}</text></svg>`
  return toDataUrl(svg)
}

/** Render the captured layout (coloured boxes + text) as a crisp, compact SVG; trims boxes until it fits the size cap. */
export function snapshotToThumbnail(snap: ThumbSnapshot, name: string, max = MAX_THUMB_CHARS): string {
  const boxes = (snap.boxes ?? []).filter((b) => b && b.w > 0 && b.h > 0)
  if (!boxes.length) return fallbackThumbnail(name)
  const build = (n: number) => {
    const parts: string[] = []
    for (const b of boxes.slice(0, n)) {
      const bg = color(b.bg)
      if (bg) parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${Math.min(Math.max(b.r, 0), 40)}" fill="${bg}"/>`)
      if (b.t) parts.push(`<text x="${b.x}" y="${b.y + Math.min(b.fs, b.h)}" font-family="system-ui,sans-serif" font-size="${Math.min(b.fs, 72)}" font-weight="${/^\d+$/.test(b.fw) ? b.fw : 400}" fill="${color(b.color, '#888')}">${esc(b.t)}</text>`)
    }
    const bg = color(snap.bg, '#ffffff')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${snap.w} ${snap.h}" preserveAspectRatio="xMidYMin slice" width="${TW}" height="${TH}"><rect width="${snap.w}" height="${snap.h}" fill="${bg}"/>${parts.join('')}</svg>`
  }
  for (let n = boxes.length; n >= 8; n = Math.floor(n * 0.8)) {
    const url = toDataUrl(build(n))
    if (url.length <= max) return url
  }
  return fallbackThumbnail(name)
}

/** Best-effort SVG → WebP rasterisation (browser only). Falls back to the SVG data URL on any failure or when it is not smaller. */
export async function rasterizeThumbnail(svgUrl: string): Promise<string> {
  try {
    if (typeof document === 'undefined' || typeof Image === 'undefined') return svgUrl
    const img = new Image()
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('decode')); img.src = svgUrl; setTimeout(() => rej(new Error('timeout')), 2000) })
    const c = document.createElement('canvas')
    c.width = TW * 2; c.height = TH * 2
    const ctx = c.getContext('2d')
    if (!ctx) return svgUrl
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const webp = c.toDataURL('image/webp', 0.72)
    return webp.startsWith('data:image/webp') && webp.length < svgUrl.length ? capThumbnail(webp) ?? svgUrl : svgUrl
  } catch { return svgUrl }
}

/** Persist a (capped) thumbnail on the project record without touching `updatedAt`. */
export async function persistThumbnail(adapter: IStorageAdapter, projectId: string, url: string | undefined): Promise<boolean> {
  const safe = capThumbnail(url)
  if (!safe) return false
  const meta = await adapter.getProject(projectId)
  if (!meta) return false
  await adapter.putProject({ ...meta, thumbnail: safe })
  return true
}
