import { create } from 'zustand'
import { uid } from '@/lib/util'
import { getAdapter } from '@/core/vfs/idbAdapter'
import { forkFromCheckpoint } from '@/core/vfs/projects'
import { applyPendingOps, runTurn, summarizeOps, type HistoryItem, type TurnEvent } from '@/core/ai/orchestrator'
import { estimateCost } from '@/core/ai/tokens'
import { clampHealSteps, pollUntil, selfHealLoop, type HealError } from '@/core/ai/selfHeal'
import { findModel } from '@/core/ai/providers'
import type { OpRecord } from '@/core/ai/apply'
import type { Usage } from '@/core/ai/types'
import { useSettings, type AIMode } from './settings'
import { useWorkspace } from './workspace'
import { useApp, navigateToProject } from './app'
import { useVault } from './vault'
import { activeConfig } from './aiConfig'
import { usePreview } from './preview'
import { useChatBus } from './chatBus'
import { useProjects } from './projects'
import { logEvent } from './events'
import { toast } from './toast'

export interface ChatPart { kind: 'text' | 'think' | 'op'; text?: string; opId?: string; done?: boolean }
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
  mode: AIMode
  images?: string[]
  parts?: ChatPart[]
  ops?: OpRecord[]
  provider?: string
  model?: string
  usage?: Usage
  cost?: number | null
  checkpointBefore?: string
  checkpointAfter?: string
  undone?: boolean
  streaming?: boolean
  durationMs?: number
  error?: { message: string; hint?: string }
}

interface ChatState {
  projectId: string | null
  messages: ChatMessage[]
  busy: boolean
  autoFix: number
  /** v2.1 self-heal status (null when idle). `originId` = the assistant turn that started the series. */
  heal: { attempt: number; max: number; phase: 'waiting' | 'healing'; originId: string } | null
  stopHeal: () => void
  undoHeal: () => Promise<void>
  controller: AbortController | null
  load: (projectId: string) => Promise<void>
  send: (p: { text: string; images?: string[]; mode?: AIMode; auto?: boolean }) => Promise<boolean>
  stop: () => void
  clear: () => Promise<void>
  deleteMessage: (id: string) => Promise<void>
  retry: (assistantId: string) => Promise<void>
  undoTurn: (assistantId: string) => Promise<void>
  forkAt: (assistantId: string) => Promise<void>
  approveOps: (assistantId: string, opIds?: string[]) => Promise<void>
  rejectOps: (assistantId: string, opIds?: string[]) => Promise<void>
}

const chatKey = (id: string) => `chat:${id}`
let saveTimer: ReturnType<typeof setTimeout> | undefined
let healAbort = false

function persist(projectId: string | null, messages: ChatMessage[]) {
  if (!projectId) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const clean = messages.map((m) => ({ ...m, streaming: false, ops: m.ops?.map((o) => (o.status === 'streaming' ? { ...o, status: 'failed' as const, detail: 'Interrupted' } : o)) }))
    void getAdapter().kvSet(chatKey(projectId), { messages: clean })
  }, 250)
}

export function buildHistory(messages: ChatMessage[]): HistoryItem[] {
  const out: HistoryItem[] = []
  for (const m of messages) {
    if (m.streaming) continue
    if (m.role === 'user') out.push({ role: 'user', text: m.text + (m.images?.length ? `\n[${m.images.length} image(s) were attached]` : '') })
    else {
      const visible = (m.parts ?? []).filter((p) => p.kind === 'text').map((p) => p.text).join('').trim()
      if (!visible && !m.ops?.length) continue
      out.push({ role: 'assistant', text: visible, summary: summarizeOps(m.ops ?? []) })
    }
  }
  return out
}

export const useChat = create<ChatState>((set, get) => {
  const update = (id: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) =>
    set((s) => {
      const messages = s.messages.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m))
      persist(s.projectId, messages)
      return { messages }
    })

  /** Autonomous self-healing build loop (see core/ai/selfHeal.ts). */
  const runHeal = async (originId: string) => {
    const vfs = useWorkspace.getState().vfs
    if (!vfs) return
    const max = clampHealSteps(useSettings.getState().maxAutoHealSteps)
    healAbort = false
    set({ heal: { attempt: 0, max, phase: 'waiting', originId } })
    const waitBuild = async (): Promise<HealError[]> => {
      const hash0 = usePreview.getState().lastHash
      await pollUntil(() => { const p = usePreview.getState(); return healAbort || p.status === 'building' || p.status === 'initializing' || p.lastHash !== hash0 }, 3000, 150)
      await pollUntil(() => { const st = usePreview.getState().status; return healAbort || (st !== 'building' && st !== 'initializing') }, 30000, 200)
      await new Promise((r) => setTimeout(r, 1800)) // brief runtime-crash window
      const p = usePreview.getState()
      return [...p.buildErrors, ...p.runtimeErrors].map((e) => ({ message: e.message, file: e.file, line: e.line, column: e.column, snippet: e.snippet, source: e.source }))
    }
    try {
      const res = await selfHealLoop({
        getErrors: waitBuild,
        readFile: (path) => vfs.read(path),
        isAborted: () => healAbort,
        onPhase: (ph) => set({ heal: { ...ph, originId } }),
        runTurn: async (prompt) => {
          const ok = await get().send({ text: prompt, mode: 'build', auto: true })
          if (!ok) return { applied: 0 }
          const last = [...get().messages].reverse().find((m) => m.role === 'assistant')
          return { applied: last?.ops?.filter((o) => o.status === 'applied').length ?? 0 }
        },
      }, max)
      if (res.status === 'green' && res.attempts > 0) toast.success('Build healed', `Green after ${res.attempts} auto-fix${res.attempts === 1 ? '' : 'es'}.`)
      else if (res.status === 'gave-up' || res.status === 'no-progress') toast.info('Auto-heal stopped', `${res.remaining.length} error${res.remaining.length === 1 ? '' : 's'} remain — you can fix them manually or undo the turn.`)
      logEvent('ai', `self-heal ${res.status} after ${res.attempts} attempt(s)`)
    } finally { set({ heal: null }) }
  }

  return {
    projectId: null, messages: [], busy: false, autoFix: 0, heal: null, controller: null,

    load: async (projectId) => {
      get().controller?.abort()
      const rec = await getAdapter().kvGet<{ messages: ChatMessage[] }>(chatKey(projectId))
      set({ projectId, messages: (rec?.messages ?? []).map((m) => ({ ...m, streaming: false })), busy: false, controller: null, autoFix: 0 })
    },

    send: async ({ text, images = [], mode, auto }) => {
      if (get().busy || !text.trim()) return false
      const vfs = useWorkspace.getState().vfs
      if (!vfs) return false
      const st = useSettings.getState()
      const cfg = activeConfig()
      if (cfg.error === 'locked') { useVault.getState().setUnlockOpen(true); toast.info('Unlock your key vault to continue'); return false }
      if (cfg.error === 'nokey' || cfg.error === 'noprovider' || !cfg.provider) { useApp.getState().setOnboardingOpen(true); return false }
      if (!auto) set({ autoFix: 0 })

      const useMode = mode ?? st.aiMode
      const history = buildHistory(get().messages)
      const userMsg: ChatMessage = { id: uid('m'), role: 'user', text: text.trim(), images, createdAt: Date.now(), mode: useMode }
      const asst: ChatMessage = { id: uid('m'), role: 'assistant', text: '', parts: [], ops: [], streaming: true, createdAt: Date.now(), mode: useMode, provider: cfg.provider.id, model: cfg.model }
      const controller = new AbortController()
      set((s) => { const messages = [...s.messages, userMsg, asst]; persist(s.projectId, messages); return { messages, busy: true, controller } })

      const draft: ChatMessage = { ...asst, parts: [], ops: [] }
      let raf = 0
      const flush = () => { raf = 0; update(asst.id, { ...draft, parts: draft.parts!.map((p) => ({ ...p })), ops: draft.ops!.map((o) => ({ ...o })) }) }
      const schedule = () => { if (!raf) raf = window.setTimeout(flush, 60) as unknown as number }
      const onEvent = (e: TurnEvent) => {
        const parts = draft.parts!
        const last = parts[parts.length - 1]
        switch (e.type) {
          case 'text': draft.text += e.text; if (last?.kind === 'text') last.text += e.text; else parts.push({ kind: 'text', text: e.text }); break
          case 'think-start': parts.push({ kind: 'think', text: '', done: false }); break
          case 'think-delta': if (last?.kind === 'think') last.text += e.text; break
          case 'think-end': if (last?.kind === 'think') last.done = true; break
          case 'op': {
            const i = draft.ops!.findIndex((o) => o.id === e.op.id)
            if (i >= 0) draft.ops![i] = { ...draft.ops![i], ...e.op }
            else { draft.ops!.push(e.op); parts.push({ kind: 'op', opId: e.op.id }) }
            break
          }
          case 'op-progress': { const o = draft.ops!.find((x) => x.id === e.id); if (o) o.lines = e.lines; break }
          case 'usage': draft.usage = e.usage; break
          case 'checkpoint-before': draft.checkpointBefore = e.id; break
        }
        schedule()
      }

      const t0 = performance.now()
      let applied = 0
      try {
        const res = await runTurn({
          vfs, provider: cfg.provider, model: cfg.model, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, mode: useMode, history, userText: text.trim(), images,
          pinned: useWorkspace.getState().pinned, customPrompts: st.customPrompts.filter((p) => p.enabled).map((p) => p.content),
          requireApproval: st.flags.approvalTray, autoCheckpoint: st.flags.autoCheckpoint, includeAllFiles: st.flags.includeAllFiles, signal: controller.signal, onEvent,
        })
        clearTimeout(raf)
        applied = res.appliedCount
        const model = findModel(cfg.provider.id, cfg.model)
        update(asst.id, {
          ...draft, streaming: false, ops: res.ops.map((o) => ({ ...o })), usage: res.usage, cost: estimateCost(res.usage, model),
          checkpointBefore: res.checkpointBefore, checkpointAfter: res.checkpointAfter, durationMs: Math.round(performance.now() - t0),
          parts: draft.parts!.map((p) => (p.kind === 'think' ? { ...p, done: true } : p)),
        })
        logEvent('ai', `${cfg.provider.id}/${cfg.model} · ${res.usage.inputTokens}→${res.usage.outputTokens} tokens · ${res.ops.length} file ops`, { durationMs: Math.round(performance.now() - t0) })
      } catch (e) {
        clearTimeout(raf)
        const err = e as Error & { hint?: string }
        const aborted = err.name === 'AbortError'
        update(asst.id, {
          ...draft, streaming: false, durationMs: Math.round(performance.now() - t0),
          ops: draft.ops!.map((o) => (o.status === 'streaming' ? { ...o, status: 'failed' as const, detail: 'Stopped before the file was finished – nothing was written.' } : { ...o })),
          parts: draft.parts!.map((p) => (p.kind === 'think' ? { ...p, done: true } : p)),
          error: aborted ? { message: 'Stopped by you.' } : { message: err.message || String(e), hint: err.hint },
        })
        if (!aborted) logEvent('error', `AI request failed: ${err.message}`)
      } finally {
        set({ busy: false, controller: null })
      }

      if (applied > 0 && !auto && useMode === 'build' && st.flags.autoHeal !== false) void runHeal(asst.id)
      else if (applied > 0 && st.flags.autoFixErrors && get().autoFix < 2) {
        // legacy single-shot auto-fix (kept for users who disabled Auto-Heal): feed the first error back (max 2 rounds)
        setTimeout(() => {
          const p = usePreview.getState()
          const err = [...p.buildErrors, ...p.runtimeErrors][0]
          if (err && !get().busy) {
            set({ autoFix: get().autoFix + 1 })
            void import('@/core/runtime/resolver').then(({ buildFixPrompt }) => useChatBus.getState().enqueue({ text: buildFixPrompt(err, vfs.textFiles()), mode: 'build', auto: true }))
          }
        }, 5000)
      }
      return true
    },

    stop: () => { healAbort = true; get().controller?.abort() },
    stopHeal: () => { healAbort = true; get().controller?.abort() },
    undoHeal: async () => {
      const id = get().heal?.originId
      healAbort = true
      get().controller?.abort()
      if (id) { await new Promise((r) => setTimeout(r, 50)); await get().undoTurn(id) }
    },

    clear: async () => {
      get().controller?.abort()
      const id = get().projectId
      set({ messages: [] })
      if (id) await getAdapter().kvDelete(chatKey(id))
    },

    deleteMessage: async (id) => {
      set((s) => { const messages = s.messages.filter((m) => m.id !== id); persist(s.projectId, messages); return { messages } })
    },

    retry: async (assistantId) => {
      const msgs = get().messages
      const i = msgs.findIndex((m) => m.id === assistantId)
      const user = msgs[i - 1]
      if (i < 1 || !user || user.role !== 'user') return
      set((s) => { const messages = s.messages.filter((m) => m.id !== assistantId && m.id !== user.id); persist(s.projectId, messages); return { messages } })
      await get().send({ text: user.text, images: user.images, mode: user.mode })
    },

    undoTurn: async (assistantId) => {
      const vfs = useWorkspace.getState().vfs
      const m = get().messages.find((x) => x.id === assistantId)
      if (!vfs || !m?.checkpointBefore) return
      try {
        await vfs.restore(m.checkpointBefore)
        update(assistantId, { undone: true })
        toast.success('Turn undone', 'The project was restored to the state before this request. Redo from the top bar.')
      } catch (e) { toast.error('Could not restore checkpoint', String(e)) }
    },

    forkAt: async (assistantId) => {
      const vfs = useWorkspace.getState().vfs
      const { messages, projectId } = get()
      const idx = messages.findIndex((x) => x.id === assistantId)
      if (!vfs || idx < 0) return
      const m = messages[idx]
      const cpId = m.checkpointAfter ?? (m.undone ? m.checkpointBefore : undefined) ?? (await vfs.checkpoint('Fork point', 'auto')).id
      const p = await forkFromCheckpoint(getAdapter(), vfs, cpId, `${vfs.meta.name} (chat fork)`)
      await getAdapter().kvSet(chatKey(p.id), { messages: messages.slice(0, idx + 1).map((x) => ({ ...x, streaming: false })) })
      await useProjects.getState().refresh()
      toast.success('Chat forked into a new project', p.name)
      void projectId
      navigateToProject(p.id)
    },

    approveOps: async (assistantId, opIds) => {
      const vfs = useWorkspace.getState().vfs
      const m = get().messages.find((x) => x.id === assistantId)
      if (!vfs || !m?.ops) return
      const pending = m.ops.filter((o) => o.status === 'pending' && (!opIds || opIds.includes(o.id)))
      if (!pending.length) return
      const res = await applyPendingOps(vfs, pending, m.text.slice(0, 56) || 'approved changes')
      const byId = new Map(res.ops.map((o) => [o.id, o]))
      update(assistantId, { ops: m.ops.map((o) => byId.get(o.id) ?? o), checkpointAfter: res.checkpointAfter ?? m.checkpointAfter })
    },

    rejectOps: async (assistantId, opIds) => {
      update(assistantId, (m) => ({ ops: m.ops?.map((o) => (o.status === 'pending' && (!opIds || opIds.includes(o.id)) ? { ...o, status: 'rejected' as const, content: undefined } : o)) }))
    },
  }
})
