import { ModelIcon } from '@/ui/icons/ModelIcon'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Eraser, MessageSquarePlus, RefreshCw, Undo2 } from 'lucide-react'
import { ChatSettings } from './ChatSettings'
import { CHAT_FONT_PX, useChatPrefs } from '@/store/chatPrefs'
import { Button, Dropdown, Tooltip } from '@/ui/primitives'
import { Composer } from './Composer'
import { MessageView } from './MessageView'
import { FollowUpChips } from './FollowUpChips'
import { gate, playChime, usePrefs } from '@/store/prefs'
import { toast } from '@/store/toast'
import { useChat } from '@/store/chat'
import { useSettings, type AIMode } from '@/store/settings'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { activeConfig } from '@/store/aiConfig'
import { buildMessages } from '@/core/ai/orchestrator'
import { buildHistory } from '@/store/chat'
import { estimateCost, formatCost, formatTokens } from '@/core/ai/tokens'
import { findModel } from '@/core/ai/providers'
import { useChatBus } from '@/store/chatBus'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'

const IDEAS = [
  'A landing page for a minimalist budgeting app with pricing and FAQ',
  'A habit tracker with streaks, a weekly heatmap and dark mode',
  'A recipe finder with ingredient filters and a saved-recipes drawer',
  'A markdown note-taking app with live preview and tags',
]

function HealPill() {
  const heal = useChat((s) => s.heal)
  const stopHeal = useChat((s) => s.stopHeal)
  const undoHeal = useChat((s) => s.undoHeal)
  if (!heal) return null
  const n = Math.max(1, heal.attempt)
  const verifying = heal.attempt === 0
  return (
    <div data-heal-pill className="flex min-w-0 shrink items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 py-0.5 pl-2 pr-1 text-[11px] font-medium text-accent" role="status" aria-live="polite">
      <RefreshCw size={11} className="shrink-0 animate-spin-fast" />
      <span className="min-w-0 truncate">{verifying ? 'Verifying build…' : <><span className="@lg:hidden">Healing {n}/{heal.max}</span><span className="hidden @lg:inline">Auto-healing build · Attempt {n}/{heal.max}</span></>}</span>
      <button onClick={stopHeal} aria-label="Stop auto-heal" className="shrink-0 rounded-full bg-accent/15 px-1.5 py-px hover:bg-accent/25">Stop</button>
      <button onClick={() => void undoHeal()} aria-label="Undo whole turn" title="Undo the whole turn (including heals)" className="shrink-0 rounded-full p-0.5 hover:bg-accent/25"><Undo2 size={11} /></button>
    </div>
  )
}

export function ChatPanel() {
  const { messages, busy, send, stop, clear } = useChat()
  const vfs = useWorkspace((s) => s.vfs)
  const pinned = useWorkspace((s) => s.pinned)
  const version = useVfsVersion(vfs)
  const mode = useSettings((s) => s.aiMode)
  const setSettings = useSettings((s) => s.set)
  const meter = useSettings((s) => s.flags.showTokenMeter)
  const includeAll = useSettings((s) => s.flags.includeAllFiles)
  const [text, setText] = useState('')
  const [images, setImages] = useState<string[]>([])
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const prefs = useChatPrefs()
  const draft = useChatBus((s) => s.draft)
  useEffect(() => { if (draft !== null) { setText(draft); useChatBus.getState().setDraft(null) } }, [draft])

  useEffect(() => {
    const el = scroller.current
    if (el && stick.current && prefs.autoScroll) el.scrollTop = el.scrollHeight
  }, [messages, prefs.autoScroll])

  const session = useMemo(() => {
    let i = 0, o = 0, cost = 0, known = false
    for (const m of messages) if (m.usage) { i += m.usage.inputTokens; o += m.usage.outputTokens; if (m.cost != null) { cost += m.cost; known = true } }
    return { i, o, cost: known ? cost : null }
  }, [messages])

  const nextCtx = useMemo(() => {
    if (!vfs || !meter) return 0
    const cfg = activeConfig()
    void cfg
    return buildMessages({ vfs, mode, history: buildHistory(messages), userText: text, pinned, includeAllFiles: includeAll }).contextTokens
  }, [vfs, version, meter, messages.length, mode, pinned, includeAll])
  const cfg = activeConfig()
  const nextCost = cfg.provider ? estimateCost({ inputTokens: nextCtx, outputTokens: 0 }, findModel(cfg.provider.id, cfg.model)) : null

  const prefs31 = usePrefs()
  const [queue, setQueue] = useState<{ text: string; images: string[] }[]>([])
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (wasBusy.current && !busy) {
      const last = useChat.getState().messages.at(-1)
      if (usePrefs.getState().completeSound && last && !last.error) playChime()
      const next = queue[0]
      if (next && usePrefs.getState().messageQueue) { setQueue((q) => q.slice(1)); void send({ text: next.text, images: next.images }) }
    }
    wasBusy.current = busy
  }, [busy])
  const submit = async () => {
    const t = text.trim()
    if (!t) return
    if (busy) {
      if (!prefs31.messageQueue) return
      setQueue((q) => [...q, { text: t, images }]); setText(''); setImages([]); haptic('tap'); toast.info('Queued', 'It will run when the agent finishes.')
      return
    }
    if (!gate('projectEdits', 'Let the agent change project files')) return
    haptic('send')
    const ok = await send({ text: t, images })
    if (ok) { setText(''); setImages([]); stick.current = true }
  }

  return (
    <div className="@container grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-x-hidden bg-bg" data-chat-root>
      <div className="flex h-11 min-w-0 items-center justify-between gap-2 border-b border-line bg-panel px-3" data-chat-header>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted"><ModelIcon modelId={cfg.model} providerId={cfg.provider?.id ?? ''} providerName={cfg.provider?.name} providerLogo={cfg.provider?.logo} size={14} /><span className="truncate">Assistant</span><HealPill /></div>
        <div className="flex shrink-0 items-center gap-1">
          {meter && prefs.showBadges && (
            <Tooltip label="Session tokens in/out · est. cost. Next request sends ≈ context tokens.">
              <span className="hidden min-w-0 max-w-[16rem] truncate rounded-md bg-subtle px-2 py-0.5 font-mono text-[10px] text-muted @lg:block">{formatTokens(session.i + session.o)} tok · {formatCost(session.cost)} · ctx≈{formatTokens(nextCtx)}{nextCost != null ? ` (${formatCost(nextCost)})` : ''}</span>
            </Tooltip>
          )}
          <ChatSettings />
          <Dropdown
            align="end"
            width={200}
            trigger={<Button variant="ghost" size="icon-sm" aria-label="Chat options"><Eraser size={14} /></Button>}
            items={[{ label: 'Clear this chat', icon: <Eraser size={14} />, danger: true, disabled: busy || messages.length === 0, onSelect: () => void clear() }]}
          />
        </div>
      </div>

      <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }} style={{ fontSize: CHAT_FONT_PX[prefs.fontSize] }} data-chat-messages className={cn('min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain', prefs.density === 'compact' ? 'space-y-3 px-3 py-3' : 'space-y-5 px-3 py-4 sm:px-4')}>
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-line bg-panel"><MessageSquarePlus size={18} className="text-muted" /></div>
            <h3 className="text-sm font-semibold">What shall we build?</h3>
            <p className="mt-1 text-xs text-muted">Describe a change in plain language. Use <code className="rounded bg-subtle px-1">@file</code> to pin context, attach a screenshot, or switch to Plan / Ask mode.</p>
            <div className="mt-4 flex w-full flex-col gap-1.5">
              {IDEAS.map((i) => <button key={i} onClick={() => setText(i)} className="rounded-xl border border-line bg-panel px-3 py-2 text-left text-xs text-muted transition hover:border-line-strong hover:text-fg">{i}</button>)}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <MessageView key={m.id} m={m} isLast={i === messages.length - 1} />)
        )}
      </div>

      <div className="min-w-0 p-2 pt-1 sm:p-3 sm:pt-1" data-chat-composer>
        {!busy && prefs31.suggestions && <FollowUpChips m={messages[messages.length - 1]} />}
        {queue.length > 0 && <p data-queue-count className="t-meta px-2 pb-1 text-fg-tertiary">{queue.length} message{queue.length === 1 ? '' : 's'} queued · runs after this turn</p>}
        <Composer
          value={text}
          onChange={setText}
          images={images}
          onImages={setImages}
          onSubmit={submit}
          queueing={prefs31.messageQueue}
          busy={busy}
          onStop={stop}
          mode={mode}
          onMode={(m: AIMode) => setSettings({ aiMode: m })}
          mentionPaths={vfs?.paths()}
          placeholder={mode === 'build' ? 'Ask for a change... (@ files, / skills)' : mode === 'plan' ? 'Describe what to plan…' : 'Ask a question about the project…'}
        />
      </div>
    </div>
  )
}
