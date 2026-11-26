import { Suspense, useEffect, useRef, useState } from 'react'
import { Code2, Eye, MessageSquare } from 'lucide-react'
import { SplitPane } from '@/ui/primitives'
import { useApp } from '@/store/app'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { usePreview } from '@/store/preview'
import { Preview } from '@/ui/preview/Preview'
import { RightPanel } from './RightPanel'
import { CodeMode } from '@/ui/code/CodeMode'
import { ChatPanel } from '@/ui/chat/ChatPanel'
import { useLiveBuild } from '@/ui/preview/useLiveBuild'
import { useIsMobile } from '@/lib/useMedia'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'

export type MobileTab = 'chat' | 'preview' | 'code'
const ORDER: MobileTab[] = ['chat', 'preview', 'code']

/** Index of the active segment (drives the animated indicator pill). */
export function segmentIndex(tab: MobileTab): number { return Math.max(0, ORDER.indexOf(tab)) }

/** Floating app-style segmented nav (<768px): Chat | Preview | Code with a sliding active pill and a live build/error dot on Preview. */
function MobileTabs({ tab, onTab }: { tab: MobileTab; onTab: (t: MobileTab) => void }) {
  const status = usePreview((s) => s.status)
  const errors = usePreview((s) => s.buildErrors.length + s.runtimeErrors.length)
  const dot = errors > 0 ? 'bg-danger' : status === 'building' || status === 'initializing' ? 'bg-warn animate-pulse-soft' : null
  const items: [MobileTab, string, React.ReactNode][] = [['chat', 'Chat', <MessageSquare size={16} key="c" />], ['preview', 'Preview', <Eye size={16} key="p" />], ['code', 'Code', <Code2 size={16} key="d" />]]
  return (
    <nav aria-label="Workspace views" data-mobile-nav className="shrink-0 px-4 pt-2 data-[hidden=true]:hidden" data-hidden="false" style={{ paddingBottom: 'max(var(--sab, 0px), 10px)' }}>
      <div className="relative mx-auto grid h-12 max-w-sm grid-cols-3 rounded-full border border-line bg-panel/90 p-1 shadow-pop backdrop-blur-xl">
        <span aria-hidden data-nav-indicator className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-accent/15 ring-1 ring-accent/30 transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)]" style={{ transform: `translateX(${segmentIndex(tab) * 100}%)` }} />
        {items.map(([id, label, icon]) => (
          <button key={id} onClick={() => onTab(id)} aria-current={tab === id ? 'page' : undefined} className={cn('press relative z-10 flex min-h-[44px] items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold', tab === id ? 'text-accent' : 'text-muted')}>
            {icon}{label}
            {id === 'preview' && dot && <span data-preview-dot className={cn('absolute right-3 top-2 h-2 w-2 rounded-full ring-2 ring-panel', dot)} />}
          </button>
        ))}
      </div>
    </nav>
  )
}

export function WorkspaceBody() {
  const mode = useApp((s) => s.mode)
  const vfs = useWorkspace((s) => s.vfs)
  useVfsVersion(vfs)
  useLiveBuild(vfs)
  const mobile = useIsMobile()
  const [tab, setTab] = useState<'chat' | 'preview'>('chat')
  const setMode = useApp((s) => s.setMode)
  const nav = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = nav.current
    if (!el) return
    const sync = () => el.querySelector('nav')?.setAttribute('data-hidden', String(document.documentElement.hasAttribute('data-keyboard')))
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-keyboard'] })
    return () => mo.disconnect()
  }, [mobile])

  if (mobile) {
    const active: MobileTab = mode === 'code' ? 'code' : tab
    const go = (t: MobileTab) => {
      haptic('select')
      if (t === 'code') { setMode('code'); return }
      setTab(t); setMode('studio')
    }
    return (
      <div ref={nav} className="grid h-full min-w-0 grid-rows-[minmax(0,1fr)_auto]">
        <div className="min-h-0 min-w-0 overflow-hidden">
          {mode === 'code' ? <Suspense fallback={null}><CodeMode /></Suspense> : (
            <div className="view-strip flex h-full w-[200%]" style={{ transform: `translateX(${tab === 'chat' ? 0 : -50}%)` }} data-view-strip>
              <div className="h-full w-1/2 min-w-0" inert={tab !== 'chat'} data-pane="chat"><ChatPanel /></div>
              <div className="h-full w-1/2 min-w-0" inert={tab !== 'preview'} data-pane="preview"><Preview /></div>
            </div>
          )}
        </div>
        <MobileTabs tab={active} onTab={go} />
      </div>
    )
  }

  if (mode === 'studio') {
    return <SplitPane storageKey="studio" initial={0.38} min={0.25} max={0.65} first={<ChatPanel />} second={<RightPanel tabs={['preview', 'theme', 'history']} />} />
  }

  return <Suspense fallback={null}><CodeMode /></Suspense>
}
