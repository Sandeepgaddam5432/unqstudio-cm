import { useState } from 'react'
import { Eye, MessageSquare } from 'lucide-react'
import { SplitPane } from '@/ui/primitives'
import { useApp } from '@/store/app'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { HistoryPanel } from './HistoryPanel'
import { Preview } from '@/ui/preview/Preview'
import { ChatPanel } from '@/ui/chat/ChatPanel'
import { useLiveBuild } from '@/ui/preview/useLiveBuild'
import { useIsMobile } from '@/lib/useMedia'
import { cn } from '@/lib/cn'

function MobileTabs({ tab, onTab }: { tab: 'chat' | 'preview'; onTab: (t: 'chat' | 'preview') => void }) {
  return (
    <div className="grid h-12 shrink-0 grid-cols-2 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]">
      {([['chat', 'Chat', <MessageSquare size={16} key="c" />], ['preview', 'Preview', <Eye size={16} key="p" />]] as const).map(([id, label, icon]) => (
        <button key={id} onClick={() => onTab(id)} className={cn('flex items-center justify-center gap-2 text-xs font-medium', tab === id ? 'text-accent' : 'text-muted')}>{icon}{label}</button>
      ))}
    </div>
  )
}

export function WorkspaceBody() {
  const mode = useApp((s) => s.mode)
  const vfs = useWorkspace((s) => s.vfs)
  useVfsVersion(vfs)
  useLiveBuild(vfs)
  const mobile = useIsMobile()
  const [tab, setTab] = useState<'chat' | 'preview'>('chat')

  if (mode === 'studio') {
    if (mobile) {
      return (
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            <div className={cn('h-full', tab !== 'chat' && 'hidden')}><ChatPanel /></div>
            <div className={cn('h-full', tab !== 'preview' && 'hidden')}><Preview /></div>
          </div>
          <MobileTabs tab={tab} onTab={setTab} />
        </div>
      )
    }
    return <SplitPane storageKey="studio" initial={0.38} min={0.25} max={0.65} first={<ChatPanel />} second={<Preview />} />
  }

  return (
    <SplitPane
      storageKey="body-code-temp"
      initial={0.34}
      first={
        <div className="flex h-full flex-col">
          <div className="max-h-[45%] overflow-auto border-b border-line p-4 font-mono text-xs">
            <p className="mb-2 font-sans text-sm text-muted">Code mode · {vfs?.size()} files</p>
            {vfs?.paths().map((p) => <div key={p}>{p}{vfs.isLocked(p) ? ' 🔒' : ''}</div>)}
          </div>
          <div className="min-h-0 flex-1"><HistoryPanel /></div>
        </div>
      }
      second={<Preview />}
    />
  )
}
