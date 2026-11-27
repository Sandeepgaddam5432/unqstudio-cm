import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DISMISS_VELOCITY, RUBBER_LIMIT, rubberBand, shouldDismiss, velocityOf } from './sheetPhysics'
import { BottomSheet } from './BottomSheet'
import { HAPTIC_PATTERNS, haptic, hapticsEnabled, hapticsSupported, setHapticsEnabled } from '@/lib/haptics'
import { keyboardInset, useVisualViewport } from '@/ui/hooks/useVisualViewport'
import { segmentIndex } from '@/ui/workspace/Body'

describe('sheet physics', () => {
  it('follows the finger downward 1:1 and resists upward drags (rubber band)', () => {
    expect(rubberBand(120)).toBe(120)
    expect(rubberBand(0)).toBe(0)
    const up = rubberBand(-300)
    expect(up).toBeLessThan(0)
    expect(Math.abs(up)).toBeLessThan(RUBBER_LIMIT)
    expect(Math.abs(rubberBand(-600))).toBeGreaterThan(Math.abs(rubberBand(-100)))
  })
  it('computes velocity over the trailing window', () => {
    expect(velocityOf([])).toBe(0)
    expect(velocityOf([{ y: 0, t: 0 }, { y: 100, t: 100 }])).toBeCloseTo(1)
    expect(velocityOf([{ y: 0, t: 0 }, { y: 0, t: 500 }, { y: 60, t: 560 }])).toBeCloseTo(1)
  })
  it('dismisses on fast flick or long drag, never on upward or tiny drags', () => {
    expect(shouldDismiss(30, DISMISS_VELOCITY + 0.1, 500)).toBe(true)
    expect(shouldDismiss(200, 0, 500)).toBe(true)
    expect(shouldDismiss(60, 0.1, 500)).toBe(false)
    expect(shouldDismiss(-200, 2, 500)).toBe(false)
  })
})

describe('BottomSheet', () => {
  afterEach(() => { vi.useRealTimers(); document.body.style.overflow = '' })
  it('locks body scroll, exposes a dialog + handle and dismisses on Escape', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<BottomSheet open onClose={onClose} title="Pick">content</BottomSheet>)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.querySelector('[data-sheet-handle]')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => { vi.advanceTimersByTime(250) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('dismisses on backdrop tap and renders nothing when closed', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const { rerender } = render(<BottomSheet open onClose={onClose}>x</BottomSheet>)
    fireEvent.click(document.querySelector('[data-sheet-backdrop]')!)
    act(() => { vi.advanceTimersByTime(250) })
    expect(onClose).toHaveBeenCalled()
    rerender(<BottomSheet open={false} onClose={onClose}>x</BottomSheet>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('haptics', () => {
  afterEach(() => { localStorage.clear(); Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true }) })
  it('is a safe no-op without navigator.vibrate', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
    expect(hapticsSupported()).toBe(false)
    expect(haptic('success')).toBe(false)
  })
  it('vibrates with the right pattern, honours the toggle and swallows errors', () => {
    const v = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { value: v, configurable: true })
    expect(hapticsEnabled()).toBe(false)
    expect(haptic('send')).toBe(false)
    setHapticsEnabled(true)
    expect(haptic('send')).toBe(true)
    expect(v).toHaveBeenCalledWith(HAPTIC_PATTERNS.send)
    setHapticsEnabled(false)
    expect(hapticsEnabled()).toBe(false)
    expect(haptic('tap')).toBe(false)
    setHapticsEnabled(true)
    Object.defineProperty(navigator, 'vibrate', { value: () => { throw new Error('blocked') }, configurable: true })
    expect(haptic('error')).toBe(false)
  })
})

describe('useVisualViewport', () => {
  it('derives keyboard inset and ignores browser-chrome jitter', () => {
    expect(keyboardInset(800, null)).toBe(0)
    expect(keyboardInset(800, { height: 500, offsetTop: 0 })).toBe(300)
    expect(keyboardInset(800, { height: 760, offsetTop: 0 })).toBe(0)
  })
  it('publishes --kb-inset when the visual viewport shrinks', () => {
    const listeners: Record<string, () => void> = {}
    const vv = { height: 800, offsetTop: 0, addEventListener: (e: string, f: () => void) => { listeners[e] = f }, removeEventListener: () => {} }
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    function Probe() { const s = useVisualViewport(); return <span data-testid="kb">{s.keyboard}</span> }
    render(<Probe />)
    expect(screen.getByTestId('kb').textContent).toBe('0')
    act(() => { vv.height = 480; listeners.resize!() })
    expect(screen.getByTestId('kb').textContent).toBe('320')
    expect(document.documentElement.style.getPropertyValue('--kb-inset')).toBe('320px')
    expect(document.documentElement.hasAttribute('data-keyboard')).toBe(true)
  })
})

describe('mobile segmented nav', () => {
  it('maps tabs to indicator positions', () => {
    expect([segmentIndex('chat'), segmentIndex('preview'), segmentIndex('code')]).toEqual([0, 1, 2])
  })
})
