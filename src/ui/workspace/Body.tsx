import { Suspense, useState } from 'react'
import { Code2, Eye, MessageSquare } from 'lucide-react'
import { SplitPane } from '@/ui/primitives'
import { useApp } from '@/store/app'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { Preview } from '@/ui/preview/Preview'
import { RightPanel } from './RightPanel'
import { CodeMode } from '@/ui/code/CodeMode'
import { ChatPanel } from '@/ui/chat/ChatPanel'
import { useLiveBuild } from '@/ui/preview/useLiveBuild'
import { useIsMobile } from '@/lib/useMedia'

import { cn } from '@/lib/cn'

type MobileTab = 'chat' | 'preview' | 'code'

/** Bottom navigation (<768px): Chat | Preview | Code. */
function MobileTabs({ tab, onTab }: { tab: MobileTab; onTab: (t: MobileTab) => void }) {
  const items: [MobileTab, string, React.ReactNode][] = [['chat', 'Chat', <MessageSquare size={17} key="c" />], ['preview', 'Preview', <Eye size={17} key="p" />], ['code', 'Code', <Code2 size={17} key="d" />]]
  return (
    <nav aria-label="Workspace views" data-mobile-nav className="grid h-14 shrink-0 grid-cols-3 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]">
      {items.map(([id, label, icon]) => (
        <button key={id} onClick={() => onTab(id)} aria-current={tab === id ? 'page' : undefined} className={cn('flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-150', tab === id ? 'text-accent' : 'text-muted hover:text-fg')}>{icon}{label}</button>
      ))}
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

  if (mobile) {
    const active: MobileTab = mode === 'code' ? 'code' : tab
    const go = (t: MobileTab) => {
      if (t === 'code') { setMode('code'); return }
      setTab(t); setMode('studio')
    }
    return (
      <div className="grid h-full min-w-0 grid-rows-[minmax(0,1fr)_auto]">
        <div className="min-h-0 min-w-0 overflow-hidden">
          {mode === 'code' ? <Suspense fallback={null}><CodeMode /></Suspense> : (
            <>
              <div className={cn('h-full', tab !== 'chat' && 'hidden')}><ChatPanel /></div>
              <div className={cn('h-full', tab !== 'preview' && 'hidden')}><Preview /></div>
            </>
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
