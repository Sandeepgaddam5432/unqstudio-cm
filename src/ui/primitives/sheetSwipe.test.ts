import { describe, expect, it } from 'vitest'
import { sheetTranslate, shouldEngageSheetDrag } from './sheetPhysics'

describe('full-sheet swipe-to-dismiss rules', () => {
  it('engages only for a mostly-vertical downward drag with the list at the top', () => {
    expect(shouldEngageSheetDrag(0, 24, 3)).toBe(true)
    expect(shouldEngageSheetDrag(40, 24, 3)).toBe(false) // list still scrolled
    expect(shouldEngageSheetDrag(0, -24, 3)).toBe(false) // upward = scroll
    expect(shouldEngageSheetDrag(0, 10, 30)).toBe(false) // horizontal
    expect(shouldEngageSheetDrag(0, 4, 0)).toBe(false) // inside slop
  })
  it('applies rubber-band resistance past 80px', () => {
    expect(sheetTranslate(-10)).toBe(0)
    expect(sheetTranslate(50)).toBe(50)
    expect(sheetTranslate(180)).toBeLessThan(180)
    expect(sheetTranslate(180)).toBeGreaterThan(80)
  })
})
