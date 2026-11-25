import { DEFAULT_FONT_LINK, DEFAULT_THEME, FONT_MARK, THEME_END, THEME_START, themeBlock, type ThemeTokens } from '@/core/vfs/scaffold'

export const GOOGLE_FONTS = ['Inter', 'Geist', 'DM Sans', 'Manrope', 'Plus Jakarta Sans', 'Space Grotesk', 'Outfit', 'Sora', 'Work Sans', 'Poppins', 'Nunito', 'Rubik', 'IBM Plex Sans', 'Figtree', 'Public Sans', 'Lora', 'Playfair Display', 'Merriweather', 'Fraunces', 'Instrument Serif', 'JetBrains Mono', 'IBM Plex Mono', 'Space Mono']

export const THEME_PRESETS: Array<{ id: string; name: string; tokens: ThemeTokens }> = [
  { id: 'ember', name: 'Ember', tokens: DEFAULT_THEME },
  { id: 'graphite', name: 'Graphite', tokens: { ...DEFAULT_THEME, accent: '#18181b', accentFg: '#fafafa', dark: { ...DEFAULT_THEME.dark, accent: '#fafafa', accentFg: '#09090b' } } },
  { id: 'ocean', name: 'Ocean', tokens: { ...DEFAULT_THEME, accent: '#0369a1', accentFg: '#ffffff', bg: '#f8fafc', line: '#e2e8f0', dark: { ...DEFAULT_THEME.dark, accent: '#38bdf8', accentFg: '#082f49', bg: '#020617', surface: '#0b1220', line: '#1e293b' } } },
  { id: 'forest', name: 'Forest', tokens: { ...DEFAULT_THEME, accent: '#15803d', accentFg: '#ffffff', bg: '#fafaf9', line: '#e7e5e4', dark: { ...DEFAULT_THEME.dark, accent: '#4ade80', accentFg: '#052e16', bg: '#0a0a09', surface: '#121211', line: '#292524' } } },
  { id: 'rose', name: 'Rose', tokens: { ...DEFAULT_THEME, accent: '#be123c', accentFg: '#ffffff', bg: '#fff7f8', line: '#fecdd3', radius: 16, dark: { ...DEFAULT_THEME.dark, accent: '#fb7185', accentFg: '#4c0519' } } },
  { id: 'sand', name: 'Sand', tokens: { ...DEFAULT_THEME, accent: '#92400e', accentFg: '#ffffff', bg: '#faf7f2', surface: '#fffdf9', line: '#e7dfd2', radius: 6, font: 'Fraunces', dark: { ...DEFAULT_THEME.dark, accent: '#fbbf24', accentFg: '#1c1917', bg: '#0c0a09', surface: '#151210', line: '#2a2420' } } },
]

export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const yiq = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000
  return yiq >= 150 ? '#09090b' : '#ffffff'
}

function readVars(block: string): Record<string, string> {
  const o: Record<string, string> = {}
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) o[m[1]] = m[2].trim()
  return o
}

/** Parse the `/* unq-theme:start *\/ … /* unq-theme:end *\/` block from a stylesheet. */
export function parseTheme(css: string): ThemeTokens | null {
  const a = css.indexOf(THEME_START)
  const b = css.indexOf(THEME_END)
  if (a < 0 || b < a) return null
  const body = css.slice(a + THEME_START.length, b)
  const darkIdx = body.indexOf('.dark')
  const light = readVars(darkIdx >= 0 ? body.slice(0, darkIdx) : body)
  const dark = darkIdx >= 0 ? readVars(body.slice(darkIdx)) : {}
  const d = DEFAULT_THEME
  const font = /--font-body:\s*"?([^",;]+)"?/.exec(body)?.[1]?.trim() ?? d.font
  return {
    accent: light.accent ?? d.accent, accentFg: light['accent-fg'] ?? d.accentFg, bg: light.bg ?? d.bg, surface: light.surface ?? d.surface,
    fg: light.fg ?? d.fg, muted: light.muted ?? d.muted, line: light.line ?? d.line,
    radius: parseInt(light.radius ?? String(d.radius), 10) || 0, font,
    dark: { accent: dark.accent ?? d.dark.accent, accentFg: dark['accent-fg'] ?? d.dark.accentFg, bg: dark.bg ?? d.dark.bg, surface: dark.surface ?? d.dark.surface, fg: dark.fg ?? d.dark.fg, muted: dark.muted ?? d.dark.muted, line: dark.line ?? d.dark.line },
  }
}

const THEME_MAP = `
@theme {
  --color-accent: var(--accent);
  --color-accent-fg: var(--accent-fg);
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-fg: var(--fg);
  --color-muted: var(--muted);
  --color-line: var(--line);
  --radius-theme: var(--radius);
  --font-sans: var(--font-body);
}
`

/** Write the theme block (creating it, plus the @theme mapping, when the project has none). */
export function writeTheme(css: string, t: ThemeTokens): string {
  const block = themeBlock(t)
  const a = css.indexOf(THEME_START)
  const b = css.indexOf(THEME_END)
  if (a >= 0 && b > a) return css.slice(0, a) + block + css.slice(b + THEME_END.length)
  const imp = /@import\s+["']tailwindcss["'];?/.exec(css)
  const head = imp ? css.slice(0, imp.index + imp[0].length) : ''
  const tail = imp ? css.slice(imp.index + imp[0].length) : css
  const mapping = /--color-accent\s*:/.test(css) ? '' : THEME_MAP
  return `${head}\n\n${block}\n${mapping}${tail}`
}

export function googleFontsLink(font: string): string {
  const fam = font.trim().replace(/\s+/g, '+')
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${fam}:wght@400;500;600;700&display=swap" />`
}

export function writeFontLink(html: string, font: string): string {
  const link = `${FONT_MARK}${googleFontsLink(font)}${FONT_MARK}`
  const a = html.indexOf(FONT_MARK)
  const b = a >= 0 ? html.indexOf(FONT_MARK, a + FONT_MARK.length) : -1
  if (a >= 0 && b > a) return html.slice(0, a) + link + html.slice(b + FONT_MARK.length)
  if (html.includes('</head>')) return html.replace('</head>', `  ${link}\n  </head>`)
  return link + html
}
export { DEFAULT_FONT_LINK }
