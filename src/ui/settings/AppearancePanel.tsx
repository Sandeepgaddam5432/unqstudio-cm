import { useState } from 'react'
import { Check } from 'lucide-react'
import { haptic, hapticsEnabled, hapticsSupported, setHapticsEnabled } from '@/lib/haptics'
import { ColorField, Section, Segmented, Switch } from '@/ui/primitives'
import { useApp, type AccentPreset, type ThemePref } from '@/store/app'
import { BG_PRESETS, resolvePreset, useTheme, type BgPresetId } from '@/store/theme'
import { cn } from '@/lib/cn'

/** Mini aurora swatch used by the Dashboard Background picker. */
function Swatch({ id, label }: { id: BgPresetId; label: string }) {
  const bg = useTheme((s) => s.bg)
  const custom = useTheme((s) => s.custom)
  const setBg = useTheme((s) => s.setBg)
  const p = resolvePreset(id, custom)
  const on = bg === id
  return (
    <button role="radio" aria-checked={on} aria-label={`${label} background`} data-bg-swatch={id} onClick={() => setBg(id)} className="press group flex flex-col items-center gap-1.5">
      <span className={cn('relative block h-14 w-full overflow-hidden rounded-xl bg-primary transition', on ? 'shadow-md-surface ring-2 ring-blue' : 'shadow-xs-surface group-hover:shadow-md-surface')}
        style={{ backgroundImage: `radial-gradient(60% 80% at 20% 10%, ${p.a}cc, transparent 70%), radial-gradient(55% 75% at 85% 15%, ${p.b}cc, transparent 70%), radial-gradient(70% 60% at 50% 100%, ${p.c}99, transparent 70%)` }}>
        {on && <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue text-blue-fg"><Check size={10} /></span>}
      </span>
      <span className="t-meta text-fg-tertiary">{label}</span>
    </button>
  )
}

/** Appearance settings: mode, Dashboard Background swatches (+ custom gradient), accent, haptics. */
export function AppearancePanel({ embedded }: { embedded?: boolean }) {
  const theme = useApp((s) => s.theme)
  const accent = useApp((s) => s.accent)
  const setAccent = useApp((s) => s.setAccent)
  const setMode = useTheme((s) => s.setMode)
  const custom = useTheme((s) => s.custom)
  const setCustom = useTheme((s) => s.setCustom)
  const [haptics, setHaptics] = useState(hapticsEnabled())
  return (
    <div className={embedded ? '' : 'p-5'} data-appearance-panel>
      <Section title="Appearance" description="Refined glass surfaces on a calm OKLCH ladder. Follow the system or pick a mode.">
        <Segmented<ThemePref> value={theme} onChange={setMode} items={[{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} />
      </Section>
      <Section title="Dashboard background" description="The Aurora scene behind the Home headline. Saved on this device.">
        <div role="radiogroup" aria-label="Dashboard background" className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {BG_PRESETS.map((p) => <Swatch key={p.id} id={p.id} label={p.label} />)}
          <Swatch id="custom" label="Custom" />
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm text-fg-secondary" data-custom-bg>
          <div className="flex items-center gap-2">Colour A<ColorField label="Custom colour A" value={custom.a} onChange={(hex) => setCustom({ a: hex })} /></div>
          <div className="flex items-center gap-2">Colour B<ColorField label="Custom colour B" value={custom.b} onChange={(hex) => setCustom({ b: hex })} /></div>
        </div>
      </Section>
      <Section title="Accent" description="Signature is a refined indigo. Warm is an optional soft amber ambience.">
        <Segmented<AccentPreset> value={accent} onChange={setAccent} items={[{ id: 'signature', label: 'Signature' }, { id: 'warm', label: 'Warm' }]} />
      </Section>
      <Section title="Haptics" description={hapticsSupported() ? 'Off by default. When enabled: subtle vibration on send, restore, build complete and errors.' : 'Vibration is not available on this device or browser.'}>
        <label className="flex items-center gap-3 text-sm"><Switch checked={haptics} onChange={(v) => { setHaptics(v); setHapticsEnabled(v); if (v) haptic('success') }} />Tactile feedback <span className="t-meta text-fg-tertiary">(opt-in)</span></label>
      </Section>
    </div>
  )
}
