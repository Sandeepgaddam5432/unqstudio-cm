import { describe, expect, it } from 'vitest'
import { chooseVersion, encodeQr, QR_MAX_VERSION, qrSvg } from './qrcode'

describe('qrcode', () => {
  it('selects the smallest version that fits the payload and returns null when oversized', () => {
    expect(chooseVersion(14, 'M')).toBe(1)
    expect(chooseVersion(15, 'M')).toBe(2)
    expect(chooseVersion(17, 'L')).toBe(1)
    expect(chooseVersion(1000, 'M')).toBeNull()
  })

  it('encodes valid square matrices with finder, timing, and dark module patterns', () => {
    const qr = encodeQr('https://unqstudio-cm.pages.dev', 'M')
    expect(qr.version).toBeGreaterThanOrEqual(1)
    expect(qr.version).toBeLessThanOrEqual(QR_MAX_VERSION)
    expect(qr.size).toBe(qr.version * 4 + 17)
    expect(qr.modules).toHaveLength(qr.size)
    for (const row of qr.modules) expect(row).toHaveLength(qr.size)

    // Finder pattern centers (top-left, top-right, bottom-left) must always be dark
    expect(qr.modules[3]?.[3]).toBe(true)
    expect(qr.modules[3]?.[qr.size - 4]).toBe(true)
    expect(qr.modules[qr.size - 4]?.[3]).toBe(true)

    // Fixed dark module and alternating timing pattern
    expect(qr.modules[qr.size - 8]?.[8]).toBe(true)
    expect(qr.modules[6]?.[8]).toBe(true)
    expect(qr.modules[6]?.[9]).toBe(false)
  })

  it('supports version 7+ payloads with version info blocks and rejects oversized text', () => {
    const longQr = encodeQr(`https://unqstudio-cm.pages.dev/${'a'.repeat(90)}`, 'M')
    expect(longQr.version).toBeGreaterThanOrEqual(7)
    expect(longQr.size).toBe(longQr.version * 4 + 17)

    expect(() => encodeQr('x'.repeat(1000), 'M')).toThrow(RangeError)
  })

  it('is deterministic for identical inputs', () => {
    const a = encodeQr('https://unqstudio-cm.pages.dev/#/p/demo', 'L')
    const b = encodeQr('https://unqstudio-cm.pages.dev/#/p/demo', 'L')
    expect(a).toEqual(b)
  })

  it('renders crisp inline SVG and sanitizes unsafe color and label options', () => {
    const svg = qrSvg('https://unqstudio-cm.pages.dev', {
      margin: 4,
      fg: '#111111',
      bg: '#ffffff',
      label: 'Open <app> "demo"',
    })
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/)
    expect(svg).toContain('aria-label="Open app demo"')
    expect(svg).toContain('fill="#111111"')
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).toContain('<path d="M')

    const fallback = qrSvg('https://example.com', {
      fg: 'javascript:alert(1)',
      bg: '"><script>alert(1)</script>',
    })
    expect(fallback).toContain('fill="#000000"')
    expect(fallback).toContain('fill="#ffffff"')
    expect(fallback).not.toContain('<script>')
  })
})
