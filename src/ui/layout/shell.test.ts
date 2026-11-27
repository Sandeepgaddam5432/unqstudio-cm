import { describe, expect, it } from 'vitest'
import { paneIndex, SHELL_VIEWS } from './MobileShell'

describe('mobile swipe shell', () => {
  it('orders panes Home → Projects → Chats', () => { expect(SHELL_VIEWS).toEqual(['home', 'projects', 'chats']) })
  it('settles on the nearest pane and clamps', () => {
    expect(paneIndex(0, 390)).toBe(0)
    expect(paneIndex(180, 390)).toBe(0)
    expect(paneIndex(200, 390)).toBe(1)
    expect(paneIndex(780, 390)).toBe(2)
    expect(paneIndex(5000, 390)).toBe(2)
    expect(paneIndex(-30, 390)).toBe(0)
    expect(paneIndex(100, 0)).toBe(0)
  })
})
