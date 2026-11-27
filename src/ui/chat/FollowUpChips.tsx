import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { followUpSuggestions } from '@/core/ai/followUpSuggestions'
import { isVersionTurn } from '@/core/ai/versions'
import { useChat, type ChatMessage } from '@/store/chat'
import { useWorkspace } from '@/store/workspace'
import { haptic } from '@/lib/haptics'

/** 1-tap next-step chips after a completed build turn; tapping sends the follow-up immediately. */
export function FollowUpChips({ m }: { m: ChatMessage | undefined }) {
  const vfs = useWorkspace((s) => s.vfs)
  const send = useChat((s) => s.send)
  const messages = useChat((s) => s.messages)
  const chips = useMemo(() => {
    if (!vfs || !m || !isVersionTurn(m) || m.undone) return []
    const exclude = messages.filter((x) => x.role === 'user').map((x) => x.text)
    return followUpSuggestions({ files: vfs.textFiles(), edited: (m.ops ?? []).filter((o) => o.status === 'applied').map((o) => o.path), exclude })
  }, [vfs, m, messages])
  if (!chips.length) return null
  return (
    <div data-followups className="scrollbar-none flex gap-2 overflow-x-auto px-2 pb-1.5 pt-1" role="group" aria-label="Suggested next steps">
      {chips.map((c) => (
        <button key={c} data-followup-chip onClick={() => { haptic('send'); void send({ text: c, mode: 'build' }) }} className="press flex min-h-[32px] shrink-0 whitespace-nowrap items-center gap-1.5 rounded-full border border-accent/30 bg-accent/8 px-3.5 text-left text-[12px] font-medium text-fg hover:bg-accent/15"><Sparkles size={12} className="shrink-0 text-accent" /><span className="min-w-0 break-words">{c}</span></button>
      ))}
    </div>
  )
}
