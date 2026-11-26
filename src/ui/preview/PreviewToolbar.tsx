import { useEffect, useState, type RefObject } from 'react'
import { ArrowLeft, ArrowRight, Camera, ExternalLink, Maximize2, Minimize2, Monitor, MoreHorizontal, MousePointer2, RotateCw, Smartphone, Tablet, Terminal, ZoomIn } from 'lucide-react'
import { Button, Dropdown, Input, Spinner } from '@/ui/primitives'
import { DEVICE_SIZES, usePreview, type Device } from '@/store/preview'
import { navigateCommand } from '@/core/runtime/routeBridge'
import { useIsMobile } from '@/lib/useMedia'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { postToPreview } from './bridge'

const VIEWPORTS: { id: Exclude<Device, 'custom'>; icon: React.ReactNode }[] = [{ id: 'desktop', icon: <Monitor size={14} /> }, { id: 'tablet', icon: <Tablet size={14} /> }, { id: 'mobile', icon: <Smartphone size={14} /> }]
const pill = 'press flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium'

/** Mini browser chrome: back/forward/reload, editable route bar, viewport pills, Visual Edit, console badge, new tab and fullscreen. */
export function PreviewToolbar({ frame, onScreenshot, onPopout, fullscreen, onFullscreen, extra }: { frame: RefObject<HTMLIFrameElement | null>; onScreenshot: () => void; onPopout: () => void; fullscreen: boolean; onFullscreen: () => void; extra?: React.ReactNode }) {
  const p = usePreview()
  const mobile = useIsMobile()
  const [draft, setDraft] = useState(p.route)
  useEffect(() => { setDraft(p.route) }, [p.route])
  const busy = p.status === 'initializing' || p.status === 'building'
  const errors = p.logs.filter((l) => l.level === 'error').length + p.runtimeErrors.length + p.buildErrors.length
  const go = (e: React.FormEvent) => { e.preventDefault(); const c = navigateCommand(draft); setDraft(c.path); postToPreview(frame.current, c) }
  const fixed = p.device !== 'desktop'
  return (
    <div data-preview-toolbar className="flex min-w-0 shrink-0 items-center gap-1.5 border-b border-line bg-panel px-2 py-1.5">
      <button aria-label="Back" onClick={() => postToPreview(frame.current, { type: 'route:back' })} disabled={!p.html} className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-subtle disabled:opacity-40"><ArrowLeft size={15} /></button>
      {!mobile && <button aria-label="Forward" onClick={() => postToPreview(frame.current, { type: 'route:forward' })} disabled={!p.html} className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-subtle disabled:opacity-40"><ArrowRight size={15} /></button>}
      <button aria-label="Reload" onClick={p.reload} className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-subtle"><RotateCw size={14} className={cn(busy && 'animate-spin-fast')} /></button>
      <form onSubmit={go} className="min-w-0 flex-1" data-route-bar>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Preview route" spellCheck={false} autoCapitalize="off" disabled={!p.html} className="h-9 w-full min-w-0 rounded-full border border-line bg-subtle px-3.5 font-mono text-[12px] outline-none focus:border-accent/60" />
      </form>
      {!mobile && (
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Viewport">
          {VIEWPORTS.map((v) => <button key={v.id} onClick={() => p.set({ device: v.id })} aria-pressed={p.device === v.id} aria-label={DEVICE_SIZES[v.id].label} title={DEVICE_SIZES[v.id].label} className={cn(pill, 'px-2.5', p.device === v.id ? 'border-accent/40 bg-accent/10 text-accent' : 'border-transparent text-muted hover:bg-subtle')}>{v.icon}</button>)}
        </div>
      )}
      {p.device === 'custom' && !mobile && (
        <div className="flex shrink-0 items-center gap-1">
          <Input type="number" min={200} max={3000} value={p.customW} onChange={(e) => p.set({ customW: Math.max(200, Number(e.target.value) || 200) })} className="h-8 w-16 px-1.5 text-center text-xs" aria-label="Custom width" />
          <span className="text-faint">×</span>
          <Input type="number" min={200} max={3000} value={p.customH} onChange={(e) => p.set({ customH: Math.max(200, Number(e.target.value) || 200) })} className="h-8 w-16 px-1.5 text-center text-xs" aria-label="Custom height" />
        </div>
      )}
      <button onClick={() => { haptic('select'); p.set({ inspectMode: !p.inspectMode, selected: null }) }} disabled={!p.html} aria-pressed={p.inspectMode} aria-label="Visual edit" data-visual-edit className={cn(pill, p.inspectMode ? 'border-[#3B82F6]/50 bg-[#3B82F6]/12 text-[#3B82F6]' : 'border-line text-muted hover:text-fg', 'disabled:opacity-40')}><MousePointer2 size={13} />{!mobile && 'Visual edit'}</button>
      <button onClick={() => p.set({ consoleOpen: !p.consoleOpen })} aria-pressed={p.consoleOpen} aria-label="Console" className={cn(pill, 'relative', p.consoleOpen ? 'border-line-strong bg-subtle text-fg' : 'border-line text-muted hover:text-fg')}><Terminal size={13} />{errors > 0 && <span data-error-badge className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{errors > 99 ? '99+' : errors}</span>}</button>
      {!mobile && <button aria-label="Pop out preview" title="Open in new tab" onClick={onPopout} disabled={!p.html} className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-subtle disabled:opacity-40"><ExternalLink size={14} /></button>}
      {!mobile && <button aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen preview'} onClick={onFullscreen} className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-subtle">{fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>}
      <Dropdown align="end" width={210} mobileSheet sheetTitle="Preview options" trigger={<button aria-label="Preview options" className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-subtle"><MoreHorizontal size={15} /></button>}
        items={[
          ...(mobile ? [{ label: 'Open in new tab', icon: <ExternalLink size={14} />, onSelect: onPopout, disabled: !p.html }, { label: fullscreen ? 'Exit fullscreen' : 'Fullscreen preview', icon: <Maximize2 size={14} />, onSelect: onFullscreen }] : []),
          { label: 'Capture screenshot', icon: <Camera size={14} />, onSelect: onScreenshot, disabled: !p.html },
          { label: 'Rotate device', icon: <RotateCw size={14} />, onSelect: () => p.set({ rotated: !p.rotated }), disabled: !fixed },
          { label: 'Custom viewport size', icon: <Maximize2 size={14} />, checked: p.device === 'custom', onSelect: () => p.set({ device: 'custom' }) },
          { separator: true },
          ...(['fit', 50, 75, 100, 125, 150] as const).map((z) => ({ label: z === 'fit' ? 'Zoom: fit to panel' : `Zoom: ${z}%`, icon: <ZoomIn size={14} />, checked: p.zoom === z, onSelect: () => p.set({ zoom: z }) })),
          { separator: true },
          { label: p.appearance === 'dark' ? 'Preview in light mode' : 'Preview in dark mode', onSelect: () => p.set({ appearance: p.appearance === 'dark' ? 'light' : 'dark' }) },
        ]} />
      {extra}
      {busy && <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-muted lg:flex"><Spinner size={12} />{p.status === 'initializing' ? 'Starting compiler' : 'Building'}</span>}
    </div>
  )
}
