import type { ModelDef } from './providers'
import type { ContentPart, LLMMessage, Usage } from './types'

/** Fast heuristic (~3.7 chars/token for code & prose mixes). Real usage from the provider always wins when available. */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 3.7)
}

export const IMAGE_TOKENS = 800

export function estimateMessageTokens(m: LLMMessage): number {
  if (typeof m.content === 'string') return estimateTokens(m.content) + 4
  return m.content.reduce((n: number, p: ContentPart) => n + (p.type === 'text' ? estimateTokens(p.text) : IMAGE_TOKENS), 4)
}
export const estimateMessagesTokens = (ms: LLMMessage[]) => ms.reduce((n, m) => n + estimateMessageTokens(m), 0)

export function estimateCost(usage: Usage, model?: Pick<ModelDef, 'priceIn' | 'priceOut'>): number | null {
  if (!model || model.priceIn == null || model.priceOut == null) return null
  return (usage.inputTokens * model.priceIn + usage.outputTokens * model.priceOut) / 1_000_000
}

export function formatCost(c: number | null): string {
  if (c == null) return '—'
  if (c === 0) return '$0'
  return c < 0.01 ? `<$0.01` : `$${c.toFixed(c < 1 ? 3 : 2)}`
}
export const formatTokens = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n >= 1000 ? `${(n / 1000).toFixed(2)}k` : String(n))
