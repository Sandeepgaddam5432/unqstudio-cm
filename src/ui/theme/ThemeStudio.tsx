import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Palette, RotateCcw, Search } from 'lucide-react'
import { Button, Dropdown, Input, Label, Segmented } from '@/ui/primitives'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { useSettings } from '@/store/settings'
import { DEFAULT_THEME, themeBlock, type ThemeTokens } from '@/core/vfs/scaffold'
import { GOOGLE_FONTS, THEME_PRESETS, contrastText, parseTheme } from '@/core/runtime/theme'
import { applyThemeToProject } from './applyTheme'
import { postToPreview } from '@/ui/preview/bridge'
import { toast } from '@/store/toast'

type Scope = 'light' | 'dark'
type ColorKey = 'accent' | 'bg' | 'surface' | 'fg' | 'muted' | 'line'
const COLORS: Array<[ColorKey, string]> = [['accent', 'Primary accent'], ['bg', 'Background'], ['surface', 'Surface'], ['fg', 'Text'], ['muted', 'Muted text'], ['line', 'Borders']]

export function ThemeStudio() {
  const vfs = useWorkspace((s) => s.vfs)
  const version = useVfsVersion(vfs)
  const pluginThemes = useSettings((s) => s.plugins.themes)
  const css = vfs?.read('/src/index.css') ?? ''
  const parsed = useMemo(() => parseTheme(css), [css])
  const [tokens, setTokens] = useState<ThemeTokens>(parsed ?? DEFAULT_THEME)
  const [scope, setScope] = useState<Scope>('light')
  const [fontQ, setFontQ] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const editing = useRef(false)

  useEffect(() => { if (parsed && !editing.current) setTokens(parsed) }, [version, parsed?.accent, parsed?.bg, parsed?.radius, parsed?.font, parsed?.dark.bg])
  if (!vfs) return null

  const commit = (next: ThemeTokens) => {
    setTokens(next)
    editing.current = true
    postToPreview(null, { type: 'theme-css', css: themeBlock(next) })
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => { await applyThemeToProject(vfs, next); editing.current = false }, 450)
  }
  const setColor = (k: ColorKey, v: string) => {
    if (scope === 'light') commit({ ...tokens, [k]: v, ...(k === 'accent' ? { accentFg: contrastText(v) } : {}) })
    else commit({ ...tokens, dark: { ...tokens.dark, [k]: v, ...(k === 'accent' ? { accentFg: contrastText(v) } : {}) } })
  }
  const val = (k: ColorKey) => (scope === 'light' ? tokens[k] : tokens.dark[k])

  const presets = [
    ...THEME_PRESETS,
    ...pluginThemes.map((p) => ({ id: `plugin:${p.id}`, name: p.name, tokens: { ...DEFAULT_THEME, accent: p.accent, accentFg: contrastText(p.accent), bg: p.bg, surface: p.surface, fg: p.fg, radius: p.radius, font: p.font } as ThemeTokens })),
  ]
  const fonts = GOOGLE_FONTS.filter((f) => f.toLowerCase().includes(fontQ.toLowerCase()))

  if (!parsed) {
    return (
      <div className="p-4 text-center">
        <Palette size={22} className="mx-auto mb-2 text-faint" />
        <p className="text-sm font-medium">No theme tokens found</p>
        <p className="mx-auto mt-1 max-w-[220px] text-xs text-muted">This project’s <code>/src/index.css</code> has no UnQStudio theme block. Add one to control colors, radius and fonts visually.</p>
        <Button className="mt-3" variant="primary" size="sm" onClick={async () => { await applyThemeToProject(vfs, DEFAULT_THEME); toast.success('Theme tokens added') }}>Add theme tokens</Button>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-3">
      <div>
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Theme Studio</h3><Button size="xs" variant="ghost" onClick={() => commit(DEFAULT_THEME)}><RotateCcw size={11} />Reset</Button></div>
        <div className="grid grid-cols-3 gap-1.5">
          {presets.map((p) => (
            <button key={p.id} onClick={() => commit(p.tokens)} className="rounded-lg border border-line p-1.5 text-left transition hover:border-line-strong" title={p.name}>
              <div className="mb-1 flex h-5 overflow-hidden rounded"><span className="flex-1" style={{ background: p.tokens.bg }} /><span className="flex-1" style={{ background: p.tokens.surface }} /><span className="flex-1" style={{ background: p.tokens.accent }} /><span className="flex-1" style={{ background: p.tokens.dark.bg }} /></div>
              <span className="block truncate text-[10px] text-muted">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between"><Label className="mb-0">Colors</Label><Segmented size="sm" value={scope} onChange={setScope} items={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} /></div>
        <div className="space-y-1.5">
          {COLORS.map(([k, label]) => (
            <div key={k} className="flex items-center gap-2">
              <input type="color" value={val(k)} onChange={(e) => setColor(k, e.target.value)} className="h-7 w-9 shrink-0 cursor-pointer rounded-md border border-line bg-subtle p-0.5" aria-label={label} />
              <span className="flex-1 text-xs text-muted">{label}</span>
              <Input value={val(k)} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && setColor(k, e.target.value)} className="h-7 w-24 px-2 font-mono text-[11px]" aria-label={`${label} hex`} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label hint={`${tokens.radius}px`}>Border radius</Label>
        <input type="range" min={0} max={32} value={tokens.radius} onChange={(e) => commit({ ...tokens, radius: Number(e.target.value) })} className="w-full accent-[var(--c-accent)]" aria-label="Border radius" />
      </div>

      <div>
        <Label>Typography (Google Fonts)</Label>
        <Dropdown
          width={240}
          trigger={<Button className="w-full justify-between" size="md"><span>{tokens.font}</span><ChevronDown size={13} /></Button>}
          triggerClassName="w-full"
          content={(close) => (
            <div>
              <div className="relative p-1"><Search size={12} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" /><Input autoFocus value={fontQ} onChange={(e) => setFontQ(e.target.value)} placeholder="Search or type a font name" onKeyDown={(e) => { if (e.key === 'Enter' && fontQ.trim()) { commit({ ...tokens, font: fontQ.trim() }); close() } }} className="h-8 pl-7 text-xs" /></div>
              {fonts.map((f) => <button key={f} onClick={() => { commit({ ...tokens, font: f }); close() }} className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-subtle">{f}</button>)}
              {fontQ.trim() && !fonts.includes(fontQ.trim()) && <button onClick={() => { commit({ ...tokens, font: fontQ.trim() }); close() }} className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-muted hover:bg-subtle">Use “{fontQ.trim()}”</button>}
            </div>
          )}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-faint">Changes apply to the live preview instantly and are saved into <code>/src/index.css</code> and <code>/index.html</code> as CSS variables.</p>
    </div>
  )
}
