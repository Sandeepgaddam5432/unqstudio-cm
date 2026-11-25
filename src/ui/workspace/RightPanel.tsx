import { useEffect, useState } from 'react'
import { Tabs } from '@/ui/primitives'
import { Preview } from '@/ui/preview/Preview'
import { ThemeStudio } from '@/ui/theme/ThemeStudio'
import { HistoryPanel } from './HistoryPanel'
import { ChatPanel } from '@/ui/chat/ChatPanel'
import { TokenInspector } from '@/ui/code/TokenInspector'
import { useChatBus } from '@/store/chatBus'
import { useWorkspace } from '@/store/workspace'
import { useApp } from '@/store/app'
import { cn } from '@/lib/cn'

export type RightTab = 'preview' | 'chat' | 'theme' | 'history' | 'tokens'
const LABEL: Record<RightTab, string> = { preview: 'Preview', chat: 'Chat', theme: 'Theme', history: 'History', tokens: 'Tokens' }

export function RightPanel({ tabs }: { tabs: RightTab[] }) {
  const [tab, setTab] = useState<RightTab>('preview')
  const draft = useChatBus((s) => s.draft)
  const showDiff = useWorkspace((s) => s.showDiff)
  useEffect(() => { if (draft !== null && tabs.includes('chat')) setTab('chat') }, [draft])
  const hasChat = tabs.includes('chat')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs size="sm" className="shrink-0 border-b border-line bg-panel px-2" value={tab} onChange={setTab} items={tabs.map((t) => ({ id: t, label: LABEL[t] }))} />
      <div className="flex min-h-0 flex-1">
        <div className={cn('min-w-0 flex-1', tab !== 'preview' && tab !== 'theme' && 'hidden')}><Preview /></div>
        {tab === 'theme' && <aside className="w-72 shrink-0 overflow-auto border-l border-line bg-panel"><ThemeStudio /></aside>}
        {hasChat && <div className={cn('min-w-0 flex-1', tab !== 'chat' && 'hidden')}><ChatPanel /></div>}
        {tab === 'history' && <div className="min-w-0 flex-1 bg-panel"><HistoryPanel onOpenDiff={(path, before, after, label) => { showDiff({ path, before, after, label }); useApp.getState().setMode('code') }} /></div>}
        {tab === 'tokens' && <div className="min-w-0 flex-1 bg-panel"><TokenInspector /></div>}
      </div>
    </div>
  )
}
