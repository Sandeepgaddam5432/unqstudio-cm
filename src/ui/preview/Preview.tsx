import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, ChevronDown, ExternalLink, Monitor, Moon, RotateCw, Smartphone, Sparkles, Sun, Tablet, Terminal, Trash2, X, ZoomIn, Copy, Maximize2 } from 'lucide-react'
import { Button, Dropdown, Input, Spinner, Tooltip, Badge } from '@/ui/primitives'
import { DEVICE_SIZES, usePreview, type Device, type LogLevel } from '@/store/preview'
import { useWorkspace } from '@/store/workspace'
import { useChatBus } from '@/store/chatBus'
import { buildFixPrompt, serializeRuntimeError } from '@/core/runtime/resolver'
import { popoutWrapper } from '@/core/runtime/previewHtml'
import { downloadBlob, slugify } from '@/lib/util'
import { toast } from '@/store/toast'
import { cn } from '@/lib/cn'
import type { SerializedError } from '@/core/runtime/types'

const pending = new Map<string, (r: { dataUrl?: string; error?: string }) => void>()

export function postToPreview(frame: HTMLIFrameElement | null, msg: Record<string, unknown>) {
  frame?.contentWindow?.postMessage({ __unq: true, ...msg }, '*')
}

const deviceIcon = { desktop: <Monitor size={14} />, tablet: <Tablet size={14} />, mobile: <Smartphone size={14} />, custom: <Maximize2 size={14} /> }
const levelStyle: Record<LogLevel, string> = { log: 'text-fg', info: 'text-fg', debug: 'text-muted', warn: 'text-warn', error: 'text-danger', build: 'text-accent' }

function ErrorBanner() {
  const p = usePreview()
  const vfs = useWorkspace((s) => s.vfs)
  const errors: SerializedError[] = [...p.buildErrors, ...p.runtimeErrors]
  if (!errors.length || p.errorDismissed) return null
  const e = errors[0]
  const fix = () => {
    useChatBus.getState().enqueue({ text: buildFixPrompt(e, vfs?.textFiles() ?? {}), mode: 'build' })
    toast.info('Sent to the AI', 'The error and file context were added to the chat.')
  }
  return (
    <div className="animate-pop absolute inset-x-3 top-3 z-20 max-h-[60%] overflow-auto rounded-xl border border-danger/40 bg-panel/95 p-3 shadow-pop backdrop-blur">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold">{e.source === 'build' ? 'Build error' : 'Runtime error'}</span>
            {errors.length > 1 && <Badge tone="danger">+{errors.length - 1} more</Badge>}
            {e.file && <span className="font-mono text-[11px] text-muted">{e.file}{e.line ? `:${e.line}` : ''}</span>}
          </div>
          <p className="mt-1 break-words text-[13px] text-fg">{e.message}</p>
          {e.snippet && <pre className="mt-2 overflow-auto rounded-lg bg-subtle p-2 font-mono text-[11px] leading-relaxed">{e.snippet}</pre>}
          {e.stack && !e.snippet && <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-subtle p-2 font-mono text-[11px] leading-relaxed text-muted">{e.stack.split('\n').slice(0, 8).join('\n')}</pre>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="accent" onClick={fix}><Sparkles size={13} />Fix with AI</Button>
            <Button size="sm" onClick={() => { void navigator.clipboard.writeText(`${e.message}\n${e.snippet ?? ''}\n${e.stack ?? ''}`); toast.success('Copied') }}><Copy size={13} />Copy</Button>
          </div>
        </div>
        <button onClick={() => p.set({ errorDismissed: true })} className="text-faint hover:text-fg" aria-label="Dismiss"><X size={14} /></button>
      </div>
    </div>
  )
}

function ConsoleDrawer() {
  const { logs, clearLogs } = usePreview()
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'log' | 'build'>('all')
  const end = useRef<HTMLDivElement>(null)
  const shown = logs.filter((l) => filter === 'all' || (filter === 'log' ? ['log', 'info', 'debug'].includes(l.level) : l.level === filter))
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [shown.length])
  return (
    <div className="flex h-44 shrink-0 flex-col border-t border-line bg-panel">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-2">
        <div className="flex gap-1">
          {(['all', 'error', 'warn', 'log', 'build'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn('rounded px-2 py-0.5 text-[11px] font-medium capitalize', filter === f ? 'bg-subtle text-fg' : 'text-muted hover:text-fg')}>{f}</button>
          ))}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={clearLogs} aria-label="Clear console"><Trash2 size={13} /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed">
        {shown.length === 0 && <p className="text-faint">No output yet.</p>}
        {shown.map((l) => (
          <div key={l.id} className={cn('whitespace-pre-wrap break-words border-b border-line/50 py-0.5', levelStyle[l.level])}>
            <span className="mr-2 text-faint">{new Date(l.ts).toLocaleTimeString([], { hour12: false })}</span>
            {l.level === 'build' && <span className="mr-1">⚙</span>}
            {l.text}
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  )
}

export function Preview({ className, toolbarExtra }: { className?: string; toolbarExtra?: React.ReactNode }) {
  const p = usePreview()
  const vfs = useWorkspace((s) => s.vfs)
  const frame = useRef<HTMLIFrameElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState({ w: 0, h: 0 })
  const errCount = p.logs.filter((l) => l.level === 'error').length

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setAvail({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data
      if (!d || d.__unq !== true || e.source !== frame.current?.contentWindow) return
      const S = usePreview.getState()
      switch (d.type) {
        case 'console': S.addLog(d.level, (d.args as string[]).join(' '), d.ts); if (d.level === 'error') S.addRuntimeError({ source: 'console', message: (d.args as string[]).join(' ').slice(0, 600) }); break
        case 'error': S.addLog('error', d.message + (d.stack ? '\n' + d.stack : '')); S.addRuntimeError(serializeRuntimeError(d)); break
        case 'resource-error': S.addLog('warn', `Failed to load resource: ${d.url}`); break
        case 'ready': postToPreview(frame.current, { type: 'theme', dark: S.appearance === 'dark' }); if (S.inspectMode) postToPreview(frame.current, { type: 'inspect:enable', on: true }); break
        case 'inspect:select': S.set({ selected: d.info }); break
        case 'screenshot': pending.get(d.id)?.(d); pending.delete(d.id); break
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => { postToPreview(frame.current, { type: 'theme', dark: p.appearance === 'dark' }) }, [p.appearance])
  useEffect(() => { postToPreview(frame.current, { type: 'inspect:enable', on: p.inspectMode }) }, [p.inspectMode])

  const base = p.device === 'custom' ? { w: p.customW, h: p.customH } : DEVICE_SIZES[p.device]
  const size = p.rotated && p.device !== 'desktop' ? { w: base.h, h: base.w } : base
  const fixed = p.device !== 'desktop'
  const fit = fixed ? Math.min(1, (avail.w - 32) / size.w, (avail.h - 32) / size.h) : 1
  const scale = Math.max(0.1, p.zoom === 'fit' ? fit : p.zoom / 100)

  const screenshot = useCallback(async () => {
    const id = Math.random().toString(36).slice(2)
    const r = await new Promise<{ dataUrl?: string; error?: string }>((resolve) => {
      pending.set(id, resolve)
      postToPreview(frame.current, { type: 'screenshot', id })
      setTimeout(() => { if (pending.delete(id)) resolve({ error: 'Timed out' }) }, 8000)
    })
    if (!r.dataUrl) return toast.error('Screenshot failed', r.error)
    const blob = await (await fetch(r.dataUrl)).blob()
    downloadBlob(blob, `${slugify(vfs?.meta.name ?? 'preview')}-preview.png`)
    toast.success('Screenshot saved')
  }, [vfs])

  const popout = () => {
    if (!p.html) return
    const url = URL.createObjectURL(new Blob([popoutWrapper(p.html, vfs?.meta.name)], { type: 'text/html' }))
    const w = window.open(url, '_blank', 'noopener')
    if (!w) toast.error('Pop-up blocked', 'Allow pop-ups for this site to open the preview in a new tab.')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const busy = p.status === 'initializing' || p.status === 'building'

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-bg', className)}>
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2">
        <Dropdown
          width={170}
          trigger={<Button size="sm" variant="ghost">{deviceIcon[p.device]}<span className="hidden sm:inline">{p.device === 'custom' ? `${p.customW}×${p.customH}` : DEVICE_SIZES[p.device].label}</span><ChevronDown size={11} /></Button>}
          items={(['desktop', 'tablet', 'mobile', 'custom'] as Device[]).map((d) => ({ label: d === 'custom' ? 'Custom size' : DEVICE_SIZES[d].label, icon: deviceIcon[d], checked: p.device === d, hint: d === 'desktop' || d === 'custom' ? undefined : `${DEVICE_SIZES[d].w}px`, onSelect: () => p.set({ device: d }) }))}
        />
        {p.device === 'custom' && (
          <div className="flex items-center gap-1">
            <Input type="number" min={200} max={3000} value={p.customW} onChange={(e) => p.set({ customW: Math.max(200, Number(e.target.value) || 200) })} className="h-7 w-16 px-1.5 text-center text-xs" aria-label="Custom width" />
            <span className="text-faint">×</span>
            <Input type="number" min={200} max={3000} value={p.customH} onChange={(e) => p.set({ customH: Math.max(200, Number(e.target.value) || 200) })} className="h-7 w-16 px-1.5 text-center text-xs" aria-label="Custom height" />
          </div>
        )}
        <Tooltip label="Rotate"><Button size="icon-sm" variant="ghost" disabled={!fixed} onClick={() => p.set({ rotated: !p.rotated })} aria-label="Rotate"><RotateCw size={14} className={cn(p.rotated && 'rotate-90')} /></Button></Tooltip>
        <Dropdown
          width={130}
          trigger={<Button size="sm" variant="ghost"><ZoomIn size={14} /><span className="text-xs">{p.zoom === 'fit' ? 'Fit' : `${p.zoom}%`}</span></Button>}
          items={(['fit', 50, 75, 100, 125, 150] as const).map((z) => ({ label: z === 'fit' ? 'Fit to panel' : `${z}%`, checked: p.zoom === z, onSelect: () => p.set({ zoom: z }) }))}
        />
        <div className="mx-1 h-4 w-px shrink-0 bg-line" />
        <Tooltip label="Reload preview"><Button size="icon-sm" variant="ghost" onClick={p.reload} aria-label="Reload"><RotateCw size={14} /></Button></Tooltip>
        <Tooltip label={p.appearance === 'dark' ? 'Preview in light mode' : 'Preview in dark mode'}><Button size="icon-sm" variant="ghost" onClick={() => p.set({ appearance: p.appearance === 'dark' ? 'light' : 'dark' })} aria-label="Toggle preview appearance">{p.appearance === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</Button></Tooltip>
        {toolbarExtra}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {busy && <span className="flex items-center gap-1.5 pr-1 text-[11px] text-muted"><Spinner size={12} />{p.status === 'initializing' ? 'Starting compiler' : 'Building'}</span>}
          {!busy && p.durationMs != null && p.status === 'ready' && <span className="hidden pr-1 font-mono text-[10px] text-faint sm:block">{p.durationMs}ms</span>}
          <Tooltip label="Screenshot"><Button size="icon-sm" variant="ghost" disabled={!p.html} onClick={screenshot} aria-label="Capture screenshot"><Camera size={14} /></Button></Tooltip>
          <Tooltip label="Open in new tab"><Button size="icon-sm" variant="ghost" disabled={!p.html} onClick={popout} aria-label="Pop out preview"><ExternalLink size={14} /></Button></Tooltip>
          <Tooltip label="Console"><Button size="icon-sm" variant="ghost" active={p.consoleOpen} onClick={() => p.set({ consoleOpen: !p.consoleOpen })} aria-label="Console"><Terminal size={14} />{errCount > 0 && <span className="ml-0.5 text-[10px] text-danger">{errCount}</span>}</Button></Tooltip>
        </div>
      </div>

      <div ref={box} className={cn('relative min-h-0 flex-1 overflow-auto', fixed && 'dot-grid')}>
        <ErrorBanner />
        {p.html ? (
          fixed ? (
            <div className="flex min-h-full min-w-full items-center justify-center p-4">
              <div style={{ width: size.w * scale, height: size.h * scale }} className="shrink-0 overflow-hidden rounded-[18px] border border-line-strong bg-white shadow-pop">
                <iframe
                  key={p.reloadKey}
                  ref={frame}
                  title="Live preview"
                  sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
                  srcDoc={p.html}
                  style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0, background: '#fff' }}
                />
              </div>
            </div>
          ) : (
            <iframe
              key={p.reloadKey}
              ref={frame}
              title="Live preview"
              sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
              srcDoc={p.html}
              style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0, background: '#fff' }}
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
            {busy ? (
              <div className="flex flex-col items-center gap-3">
                <Spinner size={20} />
                <p>{p.progress?.message ?? 'Compiling your project…'}{p.progress?.pct != null ? ` ${p.progress.pct}%` : ''}</p>
                {p.progress?.pct != null && <div className="h-1 w-40 overflow-hidden rounded-full bg-subtle"><div className="h-full bg-accent transition-all" style={{ width: `${p.progress.pct}%` }} /></div>}
              </div>
            ) : p.status === 'error' ? 'The project has build errors. Fix them to see the preview.' : 'Preparing preview…'}
          </div>
        )}
      </div>
      {p.consoleOpen && <ConsoleDrawer />}
    </div>
  )
}
