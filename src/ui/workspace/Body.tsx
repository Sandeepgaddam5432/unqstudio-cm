import { Suspense, useEffect, useRef } from 'react'
import { ChevronLeft } from 'lucide-react'
import { SplitPane } from '@/ui/primitives'
import { useApp } from '@/store/app'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { Preview } from '@/ui/preview/Preview'
import { RightPanel } from './RightPanel'
import { CodeMode } from '@/ui/code/CodeMode'
import { ChatPanel } from '@/ui/chat/ChatPanel'
import { useLiveBuild } from '@/ui/preview/useLiveBuild'
import { useIsMobile } from '@/lib/useMedia'
import { MobilePreviewBar } from './MobilePreviewBar'

export type MobileTab = 'chat' | 'preview' | 'code'
const ORDER: MobileTab[] = ['chat', 'preview', 'code']

/** Index of the active segment (drives the animated indicator pill). */
export function segmentIndex(tab: MobileTab): number { return Math.max(0, ORDER.indexOf(tab)) }

export function WorkspaceBody() {
  const mode = useApp((s) => s.mode)
  const vfs = useWorkspace((s) => s.vfs)
  useVfsVersion(vfs)
  useLiveBuild(vfs)
  const mobile = useIsMobile()
  const setMode = useApp((s) => s.setMode)
  const strip = useRef<HTMLDivElement>(null)
  const pane = useApp((s) => s.mobilePane)
  const setPane = useApp((s) => s.setMobilePane)
  const requested = useApp((s) => s.requestedTab)
  const glide = (t: 'chat' | 'preview', behavior: ScrollBehavior = 'smooth') => {
    const el = strip.current
    if (el) el.scrollTo({ left: t === 'chat' ? 0 : el.clientWidth, behavior })
  }
  useEffect(() => { if (requested) { if (useApp.getState().mode === 'code') setMode('studio'); setPane(requested.tab); requestAnimationFrame(() => glide(requested.tab)) } }, [requested])
  useEffect(() => { if (mobile && mode !== 'code') glide(useApp.getState().mobilePane, 'instant') }, [mobile, mode])
  const onScroll = () => {
    const el = strip.current
    if (!el) return
    const t = el.scrollLeft > el.clientWidth / 2 ? 'preview' : 'chat'
    if (t !== useApp.getState().mobilePane) setPane(t)
  }

  if (mobile) {
    if (mode === 'code') {
      return (
        <div className="relative h-full min-w-0">
          <Suspense fallback={null}><CodeMode /></Suspense>
          <button onClick={() => setMode('studio')} data-back-to-studio className="press absolute bottom-3 left-3 z-30 flex h-11 items-center gap-1.5 rounded-full bg-primary/90 px-4 text-[13px] font-medium shadow-floating backdrop-blur-md" style={{ marginBottom: 'var(--sab, 0px)' }}><ChevronLeft size={16} />Studio</button>
        </div>
      )
    }
    return (
      <div ref={strip} onScroll={onScroll} data-snap-strip data-active-pane={pane} className="scrollbar-none flex h-full w-full min-w-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain" style={{ scrollSnapType: 'x mandatory' }}>
        <section data-pane="chat" aria-label="Chat" className="h-full w-[100dvw] min-w-full shrink-0 snap-start snap-always overflow-hidden"><ChatPanel /></section>
        <section data-pane="preview" aria-label="Preview" className="relative h-full w-[100dvw] min-w-full shrink-0 snap-start snap-always overflow-hidden"><Preview /><MobilePreviewBar /></section>
      </div>
    )
  }

  if (mode === 'studio') {
    return <SplitPane storageKey="studio31" inset initial={0.3} min={0.2} max={0.7} minPx={320} maxPx={768} first={<ChatPanel />} second={<RightPanel tabs={['preview', 'theme', 'history']} />} />
  }

  return <Suspense fallback={null}><CodeMode /></Suspense>
}
