import { Suspense, useCallback, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { SplitPane } from '@/ui/primitives'
import { SwipePager } from '@/ui/primitives/SwipePager'
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
  const pane = useApp((s) => s.mobilePane)
  const setPane = useApp((s) => s.setMobilePane)
  const requested = useApp((s) => s.requestedTab)
  useEffect(() => { if (requested) { if (useApp.getState().mode === 'code') setMode('studio'); setPane(requested.tab) } }, [requested])
  const onIndex = useCallback((i: number) => setPane(i === 0 ? 'chat' : 'preview'), [setPane])

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
      <SwipePager index={pane === 'chat' ? 0 : 1} onIndexChange={onIndex} paneAttr="data-pane" paneKeys={['chat', 'preview']} paneLabels={['Chat', 'Preview']} rootProps={{ 'data-snap-strip': '' }}>
        <ChatPanel />
        <div className="relative h-full w-full" data-preview-pane><Preview /><MobilePreviewBar /></div>
      </SwipePager>
    )
  }

  if (mode === 'studio') {
    return <SplitPane storageKey="studio31" inset initial={0.3} min={0.2} max={0.7} minPx={320} maxPx={768} first={<ChatPanel />} second={<RightPanel tabs={['preview', 'theme', 'history']} />} />
  }

  return <Suspense fallback={null}><CodeMode /></Suspense>
}
