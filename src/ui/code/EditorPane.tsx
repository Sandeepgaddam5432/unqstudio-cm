import { Suspense, lazy, useEffect, useRef } from 'react'
import { FileCode2, GitCompare, Lock, X } from 'lucide-react'
import { Button, EmptyState, Spinner } from '@/ui/primitives'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { useApp } from '@/store/app'
import { basenameOf } from '@/core/vfs/vfs'
import { cn } from '@/lib/cn'

const CodeEditor = lazy(() => import('./CodeEditor'))
const DiffViewer = lazy(() => import('./DiffViewer').then((m) => ({ default: m.DiffViewer })))
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp' }

export function EditorPane() {
  const vfs = useWorkspace((s) => s.vfs)
  const { openTabs, activeFile, setActiveFile, closeFile, diffTarget, showDiff, reveal } = useWorkspace()
  const dark = useApp((s) => s.resolvedTheme) === 'dark'
  useVfsVersion(vfs)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<{ path: string; doc: string } | null>(null)

  const flush = () => {
    clearTimeout(timer.current)
    const p = pending.current
    pending.current = null
    if (p && vfs) void vfs.write(p.path, p.doc, { actor: 'user' })
  }
  useEffect(() => flush, [activeFile, vfs])
  useEffect(() => () => flush(), [])

  if (!vfs) return null
  const rec = activeFile ? vfs.getRecord(activeFile) : undefined
  const locked = activeFile ? vfs.lockedBy(activeFile) : null
  const showingDiff = !!diffTarget

  return (
    <div className="flex h-full min-w-0 flex-col bg-bg">
      <div className="flex h-9 shrink-0 items-end overflow-x-auto border-b border-line bg-panel">
        {openTabs.map((p) => {
          const active = p === activeFile && !showingDiff
          return (
            <div key={p} className={cn('group flex h-9 shrink-0 items-center gap-1.5 border-r border-line pl-3 pr-1.5 text-xs', active ? 'bg-bg text-fg' : 'text-muted hover:text-fg')}>
              <button onClick={() => { showDiff(null); setActiveFile(p) }} title={p} className="flex items-center gap-1.5">
                {vfs.isLocked(p) && <Lock size={10} className="text-warn" />}
                <span className={cn(!vfs.has(p) && 'line-through opacity-60')}>{basenameOf(p)}</span>
              </button>
              <button onClick={() => closeFile(p)} className="rounded p-0.5 opacity-0 hover:bg-subtle group-hover:opacity-100" aria-label={`Close ${basenameOf(p)}`}><X size={11} /></button>
            </div>
          )
        })}
        {diffTarget && (
          <div className="flex h-9 shrink-0 items-center gap-1.5 border-r border-line bg-bg pl-3 pr-1.5 text-xs text-accent">
            <GitCompare size={11} />Diff: {basenameOf(diffTarget.path)}
            <button onClick={() => showDiff(null)} className="rounded p-0.5 hover:bg-subtle" aria-label="Close diff"><X size={11} /></button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {diffTarget ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-muted"><Spinner size={18} /></div>}><DiffViewer target={diffTarget} onClose={() => showDiff(null)} /></Suspense>
        ) : !activeFile || !rec ? (
          <EmptyState icon={<FileCode2 size={22} />} title="No file open">Pick a file from the explorer or press <kbd className="rounded border border-line px-1 font-mono text-[10px]">⌘K</kbd> to search.</EmptyState>
        ) : rec.encoding === 'base64' ? (
          <div className="flex h-full items-center justify-center overflow-auto p-6 dot-grid">
            {MIME[activeFile.split('.').pop()!.toLowerCase()] ? <img src={`data:${MIME[activeFile.split('.').pop()!.toLowerCase()]};base64,${rec.content}`} alt={activeFile} className="max-h-full max-w-full rounded-lg border border-line bg-panel" /> : <p className="text-sm text-muted">Binary file ({Math.round(rec.content.length * 0.75 / 1024)} KB)</p>}
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {locked && (
              <div className="flex shrink-0 items-center gap-2 border-b border-warn/30 bg-warn/5 px-3 py-1.5 text-xs">
                <Lock size={12} className="text-warn" />
                <span className="flex-1">Locked{locked !== activeFile ? ` via ${locked}` : ''} — the AI agent cannot modify this file. You can still edit it.</span>
                <Button size="xs" variant="secondary" onClick={() => void vfs.unlock(locked)}>Unlock</Button>
              </div>
            )}
            <div className="min-h-0 flex-1">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-muted"><Spinner size={18} /></div>}>
                <CodeEditor
                  key={activeFile}
                  path={activeFile}
                  value={rec.content}
                  dark={dark}
                  reveal={reveal}
                  isDirty={() => pending.current?.path === activeFile}
                  onChange={(doc) => { pending.current = { path: activeFile, doc }; clearTimeout(timer.current); timer.current = setTimeout(flush, 350) }}
                />
              </Suspense>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
