import { useEffect, useState } from 'react'
import { Code2, Eye, FolderTree, MessageSquare } from 'lucide-react'
import { SplitPane, Tabs } from '@/ui/primitives'
import { FileTree } from './FileTree'
import { SearchPanel } from './SearchPanel'
import { EditorPane } from './EditorPane'
import { HistoryPanel } from '@/ui/workspace/HistoryPanel'
import { RightPanel } from '@/ui/workspace/RightPanel'
import { Preview } from '@/ui/preview/Preview'
import { ChatPanel } from '@/ui/chat/ChatPanel'
import { useWorkspace } from '@/store/workspace'
import { useIsMobile } from '@/lib/useMedia'
import { cn } from '@/lib/cn'

function Sidebar() {
  const [tab, setTab] = useState<'files' | 'search' | 'history'>('files')
  const showDiff = useWorkspace((s) => s.showDiff)
  return (
    <div className="flex h-full flex-col bg-panel">
      <Tabs size="sm" className="shrink-0 border-b border-line px-1" value={tab} onChange={setTab} items={[{ id: 'files', label: 'Files' }, { id: 'search', label: 'Search' }, { id: 'history', label: 'History' }]} />
      <div className="min-h-0 flex-1">
        {tab === 'files' && <FileTree />}
        {tab === 'search' && <SearchPanel />}
        {tab === 'history' && <HistoryPanel onOpenDiff={(path, before, after, label) => showDiff({ path, before, after, label })} />}
      </div>
    </div>
  )
}

type MTab = 'files' | 'code' | 'preview' | 'chat'

export function CodeMode() {
  const mobile = useIsMobile()
  const [tab, setTab] = useState<MTab>('code')
  const activeFile = useWorkspace((s) => s.activeFile)
  useEffect(() => { setTab((t) => (t === 'files' ? 'code' : t)) }, [activeFile])

  if (!mobile) {
    return (
      <SplitPane
        storageKey="code-main"
        initial={0.58}
        min={0.3}
        max={0.8}
        first={<SplitPane storageKey="code-left" initial={0.26} min={0.14} max={0.45} first={<Sidebar />} second={<EditorPane />} />}
        second={<RightPanel tabs={['preview', 'chat', 'theme', 'tokens']} />}
      />
    )
  }
  const items: Array<[MTab, string, React.ReactNode]> = [['files', 'Files', <FolderTree size={16} key="f" />], ['code', 'Code', <Code2 size={16} key="c" />], ['preview', 'Preview', <Eye size={16} key="p" />], ['chat', 'Chat', <MessageSquare size={16} key="m" />]]
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <div className={cn('h-full', tab !== 'files' && 'hidden')}><Sidebar /></div>
        <div className={cn('h-full', tab !== 'code' && 'hidden')}><EditorPane /></div>
        <div className={cn('h-full', tab !== 'preview' && 'hidden')}><Preview /></div>
        <div className={cn('h-full', tab !== 'chat' && 'hidden')}><ChatPanel /></div>
      </div>
      <div className="grid h-12 shrink-0 grid-cols-4 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]">
        {items.map(([id, label, icon]) => <button key={id} onClick={() => setTab(id)} className={cn('flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium', tab === id ? 'text-accent' : 'text-muted')}>{icon}{label}</button>)}
      </div>
    </div>
  )
}
