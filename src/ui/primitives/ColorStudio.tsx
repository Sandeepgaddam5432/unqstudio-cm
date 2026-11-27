import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { contrastRatio, formatOklch, hexToHsv, hsvToHex, parseColor, wcagGrade, type Hsv } from '@/lib/color'
import { Dropdown } from './Popover'

/** Curated, harmonious swatch palette (OKLCH-balanced lightness steps). */
export const COLOR_SWATCHES: string[] = [
  '#5b5bd6', '#6e56cf', '#8e4ec6', '#3e63dd', '#0090ff', '#00a2c7', '#12a594', '#30a46c',
  '#46a758', '#9ba000', '#f5a524', '#f76808', '#e5484d', '#d6409f', '#ab6400', '#7c7c85',
  '#0b0b12', '#27272f', '#52525b', '#a1a1aa', '#d4d4d8', '#f4f4f5', '#ffffff', '#101828',
]

function Pad({ hsv, onChange }: { hsv: Hsv; onChange: (h: Hsv) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    onChange({ ...hsv, s, v })
  }
  return (
    <div ref={ref} data-color-pad role="slider" aria-label="Saturation and brightness" aria-valuetext={`${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`} tabIndex={0}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e) }}
      onPointerMove={(e) => { if (e.buttons) set(e) }}
      onKeyDown={(e) => {
        const d = e.shiftKey ? 0.1 : 0.02
        if (e.key === 'ArrowRight') onChange({ ...hsv, s: Math.min(1, hsv.s + d) })
        else if (e.key === 'ArrowLeft') onChange({ ...hsv, s: Math.max(0, hsv.s - d) })
        else if (e.key === 'ArrowUp') onChange({ ...hsv, v: Math.min(1, hsv.v + d) })
        else if (e.key === 'ArrowDown') onChange({ ...hsv, v: Math.max(0, hsv.v - d) })
        else return
        e.preventDefault()
      }}
      className="relative h-36 w-full cursor-crosshair overflow-hidden rounded-xl shadow-xs-surface"
      style={{ touchAction: 'none', backgroundColor: `hsl(${hsv.h} 100% 50%)`, backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)' }}>
      <span className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4),0_2px_6px_rgba(0,0,0,.4)]" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }} />
    </div>
  )
}

export interface ColorStudioProps { value: string; onChange: (hex: string) => void; label?: string }

/** Modern colour picker: swatches, saturation/brightness pad, hue slider, hex/OKLCH input and live contrast preview. */
export function ColorStudio({ value, onChange, label = 'Colour' }: ColorStudioProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value))
  const [text, setText] = useState(value)
  const [bad, setBad] = useState(false)
  const last = useRef(value)
  useEffect(() => {
    if (value.toLowerCase() !== last.current.toLowerCase()) { last.current = value; setHsv(hexToHsv(value)); setText(value) }
  }, [value])
  const emit = (h: Hsv) => { const hex = hsvToHex(h); setHsv(h); setText(hex); setBad(false); last.current = hex; onChange(hex) }
  const hex = hsvToHex(hsv)
  const onWhite = contrastRatio(hex, '#ffffff'), onBlack = contrastRatio(hex, '#000000')
  const best = onWhite >= onBlack ? '#ffffff' : '#000000', ratio = Math.max(onWhite, onBlack)
  return (
    <div className="flex w-full flex-col gap-3 p-3" data-color-studio aria-label={`${label} studio`}>
      <Pad hsv={hsv} onChange={emit} />
      <input type="range" min={0} max={360} step={1} value={Math.round(hsv.h)} aria-label="Hue" data-color-hue onChange={(e) => emit({ ...hsv, h: Number(e.target.value) })}
        className="color-hue h-3 w-full cursor-pointer appearance-none rounded-full" />
      <div className="grid grid-cols-8 gap-1.5" role="listbox" aria-label="Curated swatches">
        {COLOR_SWATCHES.map((c) => (
          <button key={c} type="button" role="option" aria-selected={c === hex} aria-label={c} data-swatch={c} onClick={() => { last.current = c; setHsv(hexToHsv(c)); setText(c); setBad(false); onChange(c) }}
            className={cn('press h-6 w-full rounded-lg shadow-xs-surface', c === hex && 'ring-2 ring-blue ring-offset-1 ring-offset-primary')} style={{ background: c }} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input value={text} aria-label="Hex or OKLCH value" data-color-input spellCheck={false} onChange={(e) => {
          setText(e.target.value)
          const p = parseColor(e.target.value)
          if (p) { setBad(false); last.current = p; setHsv(hexToHsv(p)); onChange(p) } else setBad(true)
        }} className={cn('glass-field h-9 min-w-0 flex-1 rounded-xl px-3 font-mono text-[12px]', bad && 'ring-1 ring-danger')} />
      </div>
      <div className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: hex, color: best }} data-color-contrast>
        <span className="text-[15px] font-semibold">Aa</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] opacity-90">{formatOklch(hex)}</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: best === '#ffffff' ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.14)' }}>{ratio.toFixed(1)}:1 · {wcagGrade(ratio)}</span>
      </div>
    </div>
  )
}

export interface ColorFieldProps { value: string; onChange: (hex: string) => void; label: string; className?: string; showValue?: boolean }

/** Swatch button that opens the Color Studio (popover on desktop, bottom sheet on phones). Replaces `<input type="color">`. */
export function ColorField({ value, onChange, label, className, showValue = true }: ColorFieldProps) {
  return (
    <Dropdown width={284} align="start" mobileSheet sheetTitle={label} className="p-0"
      trigger={
        <button type="button" aria-label={label} data-color-trigger className={cn('press glass-field flex h-8 items-center gap-2 rounded-xl px-1.5 pr-2.5 text-[12px]', className)}>
          <span className="h-5 w-5 shrink-0 rounded-md shadow-xs-surface" style={{ background: value }} />
          {showValue && <span className="font-mono text-[11px] text-fg-secondary">{value}</span>}
        </button>
      }
      content={() => <ColorStudio value={value} onChange={onChange} label={label} />} />
  )
}
