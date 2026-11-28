// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { contrastRatio, isLargeText, parseColor, touchTargetOk, wcagLevel } from './a11yChecks'

export const a11yFixture = true
describe('a11y checks', () => {
  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#000', '#fff')).toBe(21)
    expect(contrastRatio('#777777', '#ffffff')).toBe(4.48)
    expect(contrastRatio('#767676', 'rgb(255, 255, 255)')).toBe(4.54)
    expect(contrastRatio('nope', '#fff')).toBeNull()
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30])
  })
  it('maps ratios to AA/AAA with the large-text relaxation', () => {
    expect([wcagLevel(7.1), wcagLevel(4.6), wcagLevel(4.48)]).toEqual(['AAA', 'AA', 'fail'])
    expect([wcagLevel(4.6, true), wcagLevel(3.2, true), wcagLevel(2.9, true)]).toEqual(['AAA', 'AA', 'fail'])
    expect([isLargeText(24, 400), isLargeText(19, 700), isLargeText(16, 700)]).toEqual([true, true, false])
    expect([touchTargetOk(44, 44), touchTargetOk(43, 60)]).toEqual([true, false])
  })
})
