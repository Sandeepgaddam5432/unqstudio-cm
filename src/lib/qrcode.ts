/**
 * Zero-dependency QR Code encoder (byte mode, versions 1–10, error correction L or M) rendering crisp inline SVG.
 * Follows ISO/IEC 18004: Reed–Solomon over GF(256/0x11D), interleaved blocks, function patterns, 8 masks scored by
 * penalty rules 1, 2 and 4, BCH-protected format and version information. Validated against an independent decoder in tests.
 */
export type QrEcc = 'L' | 'M'

const ECC = {
  L: { fmt: 1, cw: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18], blocks: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4] },
  M: { fmt: 0, cw: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26], blocks: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] },
} as const

export const QR_MAX_VERSION = 10

const rawModules = (v: number) => {
  let r = (16 * v + 128) * v + 64
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36 }
  return r
}
const alignPositions = (v: number): number[] => {
  if (v === 1) return []
  const n = Math.floor(v / 7) + 2
  const size = v * 4 + 17
  const step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2
  const out = [6]
  for (let p = size - 7; out.length < n; p -= step) out.splice(1, 0, p)
  return out
}
const gfMul = (x: number, y: number) => {
  let z = 0
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x }
  return z
}
const rsDivisor = (deg: number) => {
  const r = new Array<number>(deg).fill(0)
  r[deg - 1] = 1
  let root = 1
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < deg; j++) { r[j] = gfMul(r[j]!, root); if (j + 1 < deg) r[j] = r[j]! ^ r[j + 1]! }
    root = gfMul(root, 2)
  }
  return r
}
const rsRemainder = (data: number[], div: number[]) => {
  const r = new Array<number>(div.length).fill(0)
  for (const b of data) {
    const f = b ^ r.shift()!
    r.push(0)
    div.forEach((c, i) => { r[i] = r[i]! ^ gfMul(c, f) })
  }
  return r
}

export interface QrMatrix { version: number; size: number; modules: boolean[][] }

/** Smallest supported version that fits `bytes` at the given ECC level, or null when the payload is too long. */
export function chooseVersion(byteLen: number, ecc: QrEcc): number | null {
  for (let v = 1; v <= QR_MAX_VERSION; v++) {
    const data = Math.floor(rawModules(v) / 8) - ECC[ecc].cw[v - 1]! * ECC[ecc].blocks[v - 1]!
    if (4 + (v < 10 ? 8 : 16) + 8 * byteLen <= data * 8) return v
  }
  return null
}

export function encodeQr(text: string, ecc: QrEcc = 'M'): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text))
  const version = chooseVersion(bytes.length, ecc)
  if (version === null) throw new RangeError(`QR payload too long (${bytes.length} bytes; max for version ${QR_MAX_VERSION} is lower)`)
  const size = version * 4 + 17
  const cfg = ECC[ecc]
  // 1. bit stream
  const bits: number[] = []
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  put(0b0100, 4); put(bytes.length, version < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8))
  const dataCw = Math.floor(rawModules(version) / 8) - cfg.cw[version - 1]! * cfg.blocks[version - 1]!
  put(0, Math.min(4, dataCw * 8 - bits.length))
  while (bits.length % 8) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  for (let pad = 0xec; data.length < dataCw; pad ^= 0xec ^ 0x11) data.push(pad)
  // 2. ECC + interleave
  const nb = cfg.blocks[version - 1]!, eccLen = cfg.cw[version - 1]!
  const raw = Math.floor(rawModules(version) / 8)
  const shortCount = nb - (raw % nb), shortLen = Math.floor(raw / nb)
  const div = rsDivisor(eccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < shortCount ? 0 : 1)); k += dat.length
    const e = rsRemainder(dat, div)
    if (i < shortCount) dat.push(0)
    blocks.push(dat.concat(e))
  }
  const codewords: number[] = []
  for (let i = 0; i < blocks[0]!.length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= shortCount) codewords.push(b[i]!) })
  // 3. function patterns
  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean) => { m[y]![x] = dark; fn[y]![x] = true }
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4)
    }
  }
  const al = alignPositions(version)
  al.forEach((cy, i) => al.forEach((cx, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }))
  const drawFormat = (mask: number) => {
    const d = (cfg.fmt << 3) | mask
    let rem = d
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const f = ((d << 10) | rem) ^ 0x5412
    const bit = (i: number) => ((f >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) set(8, i, bit(i))
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
    set(8, size - 8, true)
  }
  drawFormat(0)
  if (version >= 7) {
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const v = (version << 12) | rem
    for (let i = 0; i < 18; i++) { const b = ((v >>> i) & 1) !== 0, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, b); set(c, a, b) }
  }
  // 4. place data
  let bi = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert
      if (!fn[y]![x] && bi < codewords.length * 8) { m[y]![x] = ((codewords[bi >>> 3]! >>> (7 - (bi & 7))) & 1) !== 0; bi++ }
    }
  }
  // 5. masks
  const MASKS = [(x: number, y: number) => (x + y) % 2 === 0, (_x: number, y: number) => y % 2 === 0, (x: number) => x % 3 === 0, (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0]
  const applyMask = (k: number) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y]![x] && MASKS[k]!(x, y)) m[y]![x] = !m[y]![x] }
  const penalty = () => {
    let p = 0
    for (let pass = 0; pass < 2; pass++) for (let a = 0; a < size; a++) {
      let run = 1
      for (let b = 1; b < size; b++) {
        const cur = pass ? m[b]![a]! : m[a]![b]!, prev = pass ? m[b - 1]![a]! : m[a]![b - 1]!
        if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++ } else run = 1
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y]![x]; if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) p += 3 }
    const dark = m.reduce((s, r) => s + r.filter(Boolean).length, 0)
    return p + Math.floor(Math.abs((dark * 20) / (size * size) - 10)) * 10
  }
  let best = 0, bestScore = Infinity
  for (let k = 0; k < 8; k++) {
    applyMask(k); drawFormat(k)
    const s = penalty()
    if (s < bestScore) { bestScore = s; best = k }
    applyMask(k)
  }
  applyMask(best); drawFormat(best)
  return { version, size, modules: m }
}

export interface QrSvgOptions { ecc?: QrEcc; margin?: number; fg?: string; bg?: string; label?: string }
const safeColor = (c: string, fb: string) => (/^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i.test(c) ? c : fb)

/** Crisp inline SVG (one `<path>` of run-length rows) for the given text; includes the 4-module quiet zone by default. */
export function qrSvg(text: string, opts: QrSvgOptions = {}): string {
  const { size, modules } = encodeQr(text, opts.ecc ?? 'M')
  const margin = opts.margin ?? 4
  const n = size + margin * 2
  let d = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules[y]![x]) continue
      let len = 1
      while (x + len < size && modules[y]![x + len]) len++
      d += `M${x + margin} ${y + margin}h${len}v1h-${len}z`
      x += len - 1
    }
  }
  const label = (opts.label ?? 'QR code').replace(/[<>&"]/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${label}"><rect width="${n}" height="${n}" fill="${safeColor(opts.bg ?? '#ffffff', '#ffffff')}"/><path d="${d}" fill="${safeColor(opts.fg ?? '#000000', '#000000')}"/></svg>`
}
