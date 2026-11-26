import { useEffect, useState } from 'react'

export interface VvLike { height: number; offsetTop: number }

/** On-screen keyboard height: the part of the layout viewport that the visual viewport no longer covers. */
export function keyboardInset(innerHeight: number, vv: VvLike | null | undefined): number {
  if (!vv) return 0
  const inset = Math.round(innerHeight - vv.height - vv.offsetTop)
  return inset > 80 ? inset : 0 // ignore browser-chrome jitter; real keyboards are > 80px
}

/**
 * Tracks `window.visualViewport` and publishes the keyboard inset as the CSS variable `--kb-inset`
 * so the workspace (and therefore the chat composer) lifts above the on-screen keyboard without clipping or double scroll.
 */
export function useVisualViewport(): { height: number; keyboard: number } {
  const read = () => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    return { height: vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 0), keyboard: keyboardInset(typeof window !== 'undefined' ? window.innerHeight : 0, vv) }
  }
  const [state, setState] = useState(read)
  useEffect(() => {
    const vv = window.visualViewport
    const sync = () => {
      const next = read()
      document.documentElement.style.setProperty('--kb-inset', `${next.keyboard}px`)
      document.documentElement.toggleAttribute('data-keyboard', next.keyboard > 0)
      setState((p) => (p.height === next.height && p.keyboard === next.keyboard ? p : next))
    }
    sync()
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    window.addEventListener('orientationchange', sync)
    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      window.removeEventListener('orientationchange', sync)
      document.documentElement.style.removeProperty('--kb-inset')
      document.documentElement.removeAttribute('data-keyboard')
    }
  }, [])
  return state
}
