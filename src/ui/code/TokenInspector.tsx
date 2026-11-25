import { useMemo } from 'react'
import { Pin } from 'lucide-react'
import { useVfsVersion, useWorkspace } from '@/store/workspace'
import { useSettings } from '@/store/settings'
import { useChat } from '@/store/chat'
import { buildProjectContext, systemInstructions } from '@/core/ai/prompts'
import { estimateCost, estimateTokens, formatCost, formatTokens } from '@/core/ai/tokens'
import { activeConfig } from '@/store/aiConfig'
import { findModel } from '@/core/ai/providers'
import { cn } from '@/lib/cn'

export function TokenInspector() {
  const vfs = useWorkspace((s) => s.vfs)
  const { pinned, togglePin } = useWorkspace()
  const version = useVfsVersion(vfs)
  const mode = useSettings((s) => s.aiMode)
  const includeAll = useSettings((s) => s.flags.includeAllFiles)
  const prompts = useSettings((s) => s.customPrompts)
  const messages = useChat((s) => s.messages)
  const cfg = activeConfig()
  const model = cfg.provider ? findModel(cfg.provider.id, cfg.model) : undefined

  const data = useMemo(() => {
    if (!vfs) return null
    const ctx = buildProjectContext(vfs, { pinned, includeAll })
    const sys = estimateTokens(systemInstructions(mode, prompts.filter((p) => p.enabled).map((p) => p.content)))
    const files = ctx.files.map((f) => ({ ...f, tokens: Math.ceil(Math.min(f.chars, 14000) / 3.7) })).sort((a, b) => b.tokens - a.tokens)
    const fileTokens = files.filter((f) => f.included).reduce((n, f) => n + f.tokens, 0)
    return { files, sys, fileTokens }
  }, [vfs, version, pinned, includeAll, mode, prompts])
  if (!vfs || !data) return null

  const history = messages.reduce((n, m) => n + estimateTokens(m.text), 0)
  const total = data.sys + data.fileTokens + history
  const cost = estimateCost({ inputTokens: total, outputTokens: 0 }, model)
  const sess = messages.reduce((a, m) => ({ i: a.i + (m.usage?.inputTokens ?? 0), o: a.o + (m.usage?.outputTokens ?? 0), c: a.c + (m.cost ?? 0) }), { i: 0, o: 0, c: 0 })
  const max = Math.max(1, ...data.files.map((f) => f.tokens))

  return (
    <div className="h-full overflow-auto p-3 text-xs">
      <div className="mb-3 grid grid-cols-2 gap-2">
        {[['Next request (est.)', `${formatTokens(total)} tok`], ['Input cost (est.)', formatCost(cost)], ['System + rules', `${formatTokens(data.sys)} tok`], ['Files in context', `${formatTokens(data.fileTokens)} tok`], ['Chat history', `${formatTokens(history)} tok`], ['Session spend', `${formatTokens(sess.i + sess.o)} tok · ${formatCost(sess.c || null)}`]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line p-2.5"><p className="text-[10px] uppercase tracking-wider text-faint">{k}</p><p className="mt-0.5 font-mono text-[13px]">{v}</p></div>
        ))}
      </div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Context files — pin to always include</p>
      {data.files.map((f) => (
        <div key={f.path} className="group flex items-center gap-2 py-1">
          <button onClick={() => togglePin(f.path)} aria-label={`Pin ${f.path}`} className={cn(pinned.includes(f.path) ? 'text-accent' : 'text-faint opacity-0 group-hover:opacity-100')}><Pin size={11} /></button>
          <span className={cn('w-40 shrink-0 truncate font-mono text-[11px]', !f.included && 'text-faint line-through')} title={f.path}>{f.path}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle"><div className={cn('h-full rounded-full', f.included ? 'bg-accent/70' : 'bg-faint/40')} style={{ width: `${(f.tokens / max) * 100}%` }} /></div>
          <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted">{f.included ? formatTokens(f.tokens) : '—'}</span>
        </div>
      ))}
    </div>
  )
}
