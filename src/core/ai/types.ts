import type { ProviderDef } from './providers'

export type Role = 'system' | 'user' | 'assistant'
export type ContentPart = { type: 'text'; text: string } | { type: 'image'; dataUrl: string }
export interface LLMMessage { role: Role; content: string | ContentPart[] }
export interface Usage { inputTokens: number; outputTokens: number; estimated?: boolean }

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'usage'; usage: Usage }

export interface StreamRequest {
  provider: ProviderDef
  model: string
  apiKey?: string
  baseUrl?: string
  messages: LLMMessage[]
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
  fetchImpl?: typeof fetch
}

export class ProviderError extends Error {
  constructor(message: string, public status?: number, public hint?: string) {
    super(message)
    this.name = 'ProviderError'
  }
}
