export const LUCIDE = { 'lucide-react': '^0.469.0' }

export const THEME_TOGGLE = String.raw`import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  return (
    <button
      onClick={() => setDark(!dark)}
      aria-label="Toggle theme"
      className="flex h-9 w-9 items-center justify-center rounded-theme border border-line text-muted transition hover:text-fg"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
`
