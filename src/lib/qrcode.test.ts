import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { chooseVersion, encodeQr, qrSvg } from './qrcode'

/** Rasterise a matrix to RGBA (with quiet zone) so an independent decoder can read it. */
function raster(text: string, ecc: 'L' | 'M', scale = 5) {
  const { size, modules } = encodeQr(text, ecc)
  const n = (size + 8) * scale
  const data = new Uint8ClampedArray(n * n * 4).fill(255)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y]![x]) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const i = (((y + 4) * scale + dy) * n + (x + 4) * scale + dx) * 4; data[i] = data[i + 1] = data[i + 2] = 0 }
  return jsQR(data, n, n)
}

describe('pure TypeScript QR generator', () => {
  const samples: [string, 'L' | 'M'][] = [
    ['https://unqstudio-cm.pages.dev', 'M'],
    ['https://my-app-1234.netlify.app/?utm_source=qr&ref=unqstudio', 'M'],
    ['https://example.com/' + 'a'.repeat(110), 'M'],
    ['https://example.com/' + 'b'.repeat(130), 'L'],
    ['Héllo wörld ✓ — 你好', 'M'],
    ['x', 'L'],
  ]
  for (const [text, ecc] of samples) {
    it(`decodes back to the exact text (${text.length} chars, ECC ${ecc})`, () => {
      const r = raster(text, ecc)
      expect(r).not.toBeNull()
      expect(r!.data).toBe(text)
    })
  }
  it('uses the expected symbol sizes and covers versions ≥ 7 (version info blocks)', () => {
    expect(encodeQr('hi').version).toBe(1)
    expect(encodeQr('hi').size).toBe(21)
    const big = encodeQr('https://example.com/' + 'a'.repeat(110), 'M')
    expect(big.version).toBeGreaterThanOrEqual(7)
    expect(big.size).toBe(big.version * 4 + 17)
  })
  it('rejects payloads that do not fit and reports capacity', () => {
    expect(chooseVersion(10, 'M')).toBe(1)
    expect(chooseVersion(9999, 'M')).toBeNull()
    expect(() => encodeQr('z'.repeat(400))).toThrow(RangeError)
  })
  it('renders a valid, self-contained inline SVG with a quiet zone', () => {
    const svg = qrSvg('https://a.dev', { label: 'my <qr>' })
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).toContain('<path d="M')
    expect(svg).not.toContain('<qr>')
    const { size } = encodeQr('https://a.dev')
    expect(svg).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`)
    expect(qrSvg('x', { fg: 'red" onload="1' })).not.toContain('onload')
  })
})
