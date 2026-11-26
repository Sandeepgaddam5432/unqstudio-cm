/** Tactile feedback (v3.0): safe wrapper around `navigator.vibrate`. No-ops everywhere vibration is unavailable (desktop, iOS Safari, SSR, tests). */
export type HapticKind = 'tap' | 'select' | 'send' | 'success' | 'warning' | 'error'

export const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  select: 12,
  send: 16,
  success: [14, 40, 22],
  warning: [24, 50, 24],
  error: [38, 60, 38, 60, 38],
}

const KEY = 'unq.haptics'

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export function hapticsEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== '0' } catch { return true }
}

export function setHapticsEnabled(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode */ }
}

/** Fire a vibration pattern. Returns true only when the browser accepted it. Never throws. */
export function haptic(kind: HapticKind = 'tap'): boolean {
  if (!hapticsSupported() || !hapticsEnabled()) return false
  try { return navigator.vibrate(HAPTIC_PATTERNS[kind]) } catch { return false }
}
