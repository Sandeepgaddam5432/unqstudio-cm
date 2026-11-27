import { useState } from 'react'
import { Bookmark, Code2, Eye, History, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { timeAgo } from '@/lib/util'
import { assignVersions, versionCheckpoint, versionTitle } from '@/core/ai/versions'
import { useChat, type ChatMessage } from '@/store/chat'
import { useWorkspace } from '@/store/workspace'
import { useApp } from '@/store/app'
import { useProjects } from '@/store/projects'
import { toast } from '@/store/toast'

/** Signature inline Version Card: v-badge + change title, bookmark, and Preview / Code·Diff / Restore pills. */
export function VersionCard({ m }: { m: ChatMessage }) {
  const messages = useChat((s) => s.messages)
  const vfs = useWorkspace((s) => s.vfs)
  const [, bump] = useState(0)
  const n = assignVersions(messages).get(m.id)
  const cp = versionCheckpoint(m)
  if (!n || !vfs) return null
  const starred = !!cp && !!vfs.meta.bookmarks?.includes(cp)
  const title = versionTitle(messages, m.id)
  const toggleStar = async () => {
    if (!cp) return
    const cur = vfs.meta.bookmarks ?? []
    const next = starred ? cur.filter((x) => x !== cp) : [...cur, cp]
    vfs.meta.bookmarks = next
    await useProjects.getState().update(vfs.meta.id, { bookmarks: next, updatedAt: vfs.meta.updatedAt })
    haptic('select'); bump((x) => x + 1)
  }
  const restore = async () => {
    if (!cp) return
    await vfs.checkpoint(`Safety checkpoint before restoring v${n}`, 'auto')
    await vfs.restore(cp)
    haptic('success'); toast.success(`Restored v${n}`, 'A safety checkpoint of the previous state was saved.')
    bump((x) => x + 1)
  }
  const pill = 'press flex min-h-[40px] items-center gap-1.5 rounded-full border border-line bg-subtle px-3.5 text-[12px] font-medium text-fg hover:border-line-strong'
  return (
    <div data-version-card={n} className="my-2 rounded-xl border border-border-depth bg-primary p-3 shadow-xs-surface">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-accent/12 px-2 text-[12px] font-bold text-accent"><History size={12} />v{n}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold" title={title}>{title}</p><p className="text-[11px] text-faint">{timeAgo(m.createdAt)}{m.undone ? ' · undone' : ''}</p></div>
        <button onClick={toggleStar} aria-label={starred ? `Remove bookmark from v${n}` : `Bookmark v${n}`} aria-pressed={starred} className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-subtle"><Bookmark size={15} className={cn(starred ? 'fill-accent text-accent' : 'text-muted')} /></button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button className={pill} data-version-details onClick={() => { haptic('tap'); useApp.getState().openActivity(m.id, 'changes') }}><Code2 size={13} />Details</button>
        <button className={pill} onClick={() => { haptic('tap'); useApp.getState().setMode('studio'); useApp.getState().requestTab('preview') }}><Eye size={13} />Preview</button>
        <button className={pill} disabled={!cp} onClick={() => void restore()}><RotateCcw size={13} />Restore</button>
      </div>
    </div>
  )
}
