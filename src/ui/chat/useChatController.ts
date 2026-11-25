import { useEffect } from 'react'
import { useWorkspace } from '@/store/workspace'
import { useChat } from '@/store/chat'
import { useChatBus } from '@/store/chatBus'
import { useApp } from '@/store/app'

/** Headless glue mounted with the workspace: loads the project's chat and consumes queued messages (home prompt, Fix-with-AI, inspector). */
export function useChatController() {
  const vfs = useWorkspace((s) => s.vfs)
  const projectId = vfs?.projectId
  const loaded = useChat((s) => s.projectId)
  const queued = useChatBus((s) => s.queued)
  const pending = useApp((s) => s.pendingPrompt)
  const busy = useChat((s) => s.busy)

  useEffect(() => { if (projectId) void useChat.getState().load(projectId) }, [projectId])

  useEffect(() => {
    if (!vfs || loaded !== projectId || busy) return
    const q = useChatBus.getState().take()
    if (q) void useChat.getState().send({ text: q.text, images: q.images, mode: q.mode, auto: q.auto })
  }, [queued, vfs, loaded, projectId, busy])

  useEffect(() => {
    if (!vfs || loaded !== projectId || busy || !pending) return
    useApp.getState().setPendingPrompt(null)
    void useChat.getState().send({ text: pending.text, images: pending.images, mode: 'build' })
  }, [pending, vfs, loaded, projectId, busy])
}
