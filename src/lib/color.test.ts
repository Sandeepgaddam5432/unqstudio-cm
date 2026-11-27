import { describe, expect, it } from 'vitest'
import { contrastRatio, formatOklch, hexToHsv, hsvToHex, hexToOklch, normalizeHex, oklchToHex, parseColor, parseOklch, wcagGrade } from './color'

describe('color maths', () => {
  it('normalises hex shorthand and rejects junk', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('112233')).toBe('#112233')
    expect(normalizeHex('xyz')).toBeNull()
  })
  it('round-trips HSV and OKLCH', () => {
    for (const hex of ['#6366f1', '#ff0000', '#22c3a6', '#808080']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex)
      const back = oklchToHex(hexToOklch(hex))
      const d = (i: number) => Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16))
      expect(d(1) + d(3) + d(5)).toBeLessThanOrEqual(3)
    }
  })
  it('formats and parses oklch strings', () => {
    expect(formatOklch('#ffffff')).toMatch(/^oklch\(100\.0% 0\.000/)
    expect(parseOklch('oklch(100% 0 0)')).toBe('#ffffff')
    expect(parseColor('oklch(nope)')).toBeNull()
    expect(parseColor('#fff')).toBe('#ffffff')
  })
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(wcagGrade(21)).toBe('AAA')
    expect(wcagGrade(2)).toBe('Fail')
  })
})
