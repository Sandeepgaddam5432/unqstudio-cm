/** Registry of direct-browser BYOK LLM providers. Add a provider by appending to PROVIDERS. */
export type ProviderKind = 'openai' | 'anthropic'

export interface ModelDef {
  id: string
  label?: string
  vision?: boolean
  reasoning?: boolean
  free?: boolean
  /** USD per 1M tokens (approximate, used for the cost meter). */
  priceIn?: number
  priceOut?: number
}

export interface ProviderDef {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  models: ModelDef[]
  keyUrl?: string
  freeTier?: string
  local?: boolean
  noKey?: boolean
  userModels?: boolean
  blurb: string
  /** Extra static headers. */
  headers?: Record<string, string>
}

const m = (id: string, extra: Partial<ModelDef> = {}): ModelDef => ({ id, ...extra })

export const PROVIDERS: ProviderDef[] = [
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys', freeTier: 'Many “:free” models, no card required', blurb: 'One key, hundreds of models.',
    headers: { 'X-Title': 'UnQStudio' },
    models: [m('anthropic/claude-sonnet-4.5', { vision: true, priceIn: 3, priceOut: 15 }), m('openai/gpt-5', { vision: true, reasoning: true, priceIn: 1.25, priceOut: 10 }), m('google/gemini-2.5-pro', { vision: true, reasoning: true, priceIn: 1.25, priceOut: 10 }), m('deepseek/deepseek-chat-v3.1', { priceIn: 0.27, priceOut: 1.1 }), m('qwen/qwen3-coder', { priceIn: 0.3, priceOut: 1.2 }), m('meta-llama/llama-3.3-70b-instruct:free', { free: true }), m('deepseek/deepseek-r1-0528:free', { free: true, reasoning: true })] },
  { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys', blurb: 'GPT-5, GPT-4.1 and o-series.',
    models: [m('gpt-5', { vision: true, reasoning: true, priceIn: 1.25, priceOut: 10 }), m('gpt-5-mini', { vision: true, reasoning: true, priceIn: 0.25, priceOut: 2 }), m('gpt-4.1', { vision: true, priceIn: 2, priceOut: 8 }), m('gpt-4o', { vision: true, priceIn: 2.5, priceOut: 10 }), m('o4-mini', { reasoning: true, priceIn: 1.1, priceOut: 4.4 })] },
  { id: 'anthropic', name: 'Anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', keyUrl: 'https://console.anthropic.com/settings/keys', blurb: 'Claude, called directly from your browser.',
    models: [m('claude-sonnet-4-5', { vision: true, priceIn: 3, priceOut: 15 }), m('claude-opus-4-1', { vision: true, priceIn: 15, priceOut: 75 }), m('claude-haiku-4-5', { vision: true, priceIn: 1, priceOut: 5 }), m('claude-3-7-sonnet-latest', { vision: true, priceIn: 3, priceOut: 15 })] },
  { id: 'gemini', name: 'Google Gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey', freeTier: 'Generous free tier in Google AI Studio', blurb: 'Gemini 2.5 via the OpenAI-compatible endpoint.',
    models: [m('gemini-2.5-pro', { vision: true, reasoning: true, priceIn: 1.25, priceOut: 10 }), m('gemini-2.5-flash', { vision: true, priceIn: 0.3, priceOut: 2.5 }), m('gemini-2.0-flash', { vision: true, priceIn: 0.1, priceOut: 0.4 })] },
  { id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', freeTier: 'Free tier with rate limits', blurb: 'Very fast open-model inference.',
    models: [m('llama-3.3-70b-versatile', { priceIn: 0.59, priceOut: 0.79 }), m('openai/gpt-oss-120b', { reasoning: true, priceIn: 0.15, priceOut: 0.75 }), m('moonshotai/kimi-k2-instruct', { priceIn: 1, priceOut: 3 }), m('qwen/qwen3-32b', { reasoning: true, priceIn: 0.29, priceOut: 0.59 })] },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/api_keys', blurb: 'Low-cost strong coding models.',
    models: [m('deepseek-chat', { priceIn: 0.27, priceOut: 1.1 }), m('deepseek-reasoner', { reasoning: true, priceIn: 0.55, priceOut: 2.19 })] },
  { id: 'xai', name: 'xAI', kind: 'openai', baseUrl: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai', blurb: 'Grok models.',
    models: [m('grok-4', { vision: true, reasoning: true, priceIn: 3, priceOut: 15 }), m('grok-3-mini', { reasoning: true, priceIn: 0.3, priceOut: 0.5 }), m('grok-code-fast-1', { priceIn: 0.2, priceOut: 1.5 })] },
  { id: 'mistral', name: 'Mistral', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys', freeTier: 'Free “Experiment” plan', blurb: 'Mistral Large, Codestral, Pixtral.',
    models: [m('mistral-large-latest', { priceIn: 2, priceOut: 6 }), m('codestral-latest', { priceIn: 0.3, priceOut: 0.9 }), m('mistral-small-latest', { priceIn: 0.1, priceOut: 0.3 }), m('pixtral-large-latest', { vision: true, priceIn: 2, priceOut: 6 })] },
  { id: 'together', name: 'Together AI', kind: 'openai', baseUrl: 'https://api.together.xyz/v1', keyUrl: 'https://api.together.ai/settings/api-keys', blurb: 'Open-source models at scale.',
    models: [m('meta-llama/Llama-3.3-70B-Instruct-Turbo', { priceIn: 0.88, priceOut: 0.88 }), m('Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8', { priceIn: 2, priceOut: 2 }), m('deepseek-ai/DeepSeek-V3', { priceIn: 1.25, priceOut: 1.25 })] },
  { id: 'fireworks', name: 'Fireworks AI', kind: 'openai', baseUrl: 'https://api.fireworks.ai/inference/v1', keyUrl: 'https://fireworks.ai/account/api-keys', blurb: 'Fast open-model serving.',
    models: [m('accounts/fireworks/models/llama-v3p3-70b-instruct', { priceIn: 0.9, priceOut: 0.9 }), m('accounts/fireworks/models/qwen3-coder-480b-a35b-instruct', { priceIn: 0.45, priceOut: 1.8 }), m('accounts/fireworks/models/deepseek-v3', { priceIn: 0.9, priceOut: 0.9 })] },
  { id: 'cerebras', name: 'Cerebras', kind: 'openai', baseUrl: 'https://api.cerebras.ai/v1', keyUrl: 'https://cloud.cerebras.ai', freeTier: 'Free tier available', blurb: 'Extremely fast inference.',
    models: [m('llama-3.3-70b', { priceIn: 0.85, priceOut: 1.2 }), m('qwen-3-coder-480b', { priceIn: 2, priceOut: 2 }), m('gpt-oss-120b', { reasoning: true, priceIn: 0.25, priceOut: 0.69 })] },
  { id: 'moonshot', name: 'Moonshot / Kimi', kind: 'openai', baseUrl: 'https://api.moonshot.ai/v1', keyUrl: 'https://platform.moonshot.ai/console/api-keys', blurb: 'Kimi K2 long-context agents.',
    models: [m('kimi-k2-0905-preview', { priceIn: 0.6, priceOut: 2.5 }), m('kimi-k2-turbo-preview', { priceIn: 1.15, priceOut: 8 })] },
  { id: 'perplexity', name: 'Perplexity', kind: 'openai', baseUrl: 'https://api.perplexity.ai', keyUrl: 'https://www.perplexity.ai/settings/api', blurb: 'Search-grounded Sonar models.',
    models: [m('sonar-pro', { priceIn: 3, priceOut: 15 }), m('sonar', { priceIn: 1, priceOut: 1 }), m('sonar-reasoning', { reasoning: true, priceIn: 1, priceOut: 5 })] },
  { id: 'hyperbolic', name: 'Hyperbolic', kind: 'openai', baseUrl: 'https://api.hyperbolic.xyz/v1', keyUrl: 'https://app.hyperbolic.xyz/settings', blurb: 'Affordable open-model GPUs.',
    models: [m('meta-llama/Llama-3.3-70B-Instruct', { priceIn: 0.4, priceOut: 0.4 }), m('deepseek-ai/DeepSeek-V3', { priceIn: 0.25, priceOut: 0.25 }), m('Qwen/Qwen2.5-Coder-32B-Instruct', { priceIn: 0.2, priceOut: 0.2 })] },
  { id: 'huggingface', name: 'Hugging Face', kind: 'openai', baseUrl: 'https://router.huggingface.co/v1', keyUrl: 'https://huggingface.co/settings/tokens', freeTier: 'Free monthly inference credits', blurb: 'Inference Providers router.',
    models: [m('Qwen/Qwen3-Coder-480B-A35B-Instruct'), m('deepseek-ai/DeepSeek-V3.1'), m('meta-llama/Llama-3.3-70B-Instruct')] },
  { id: 'cohere', name: 'Cohere', kind: 'openai', baseUrl: 'https://api.cohere.ai/compatibility/v1', keyUrl: 'https://dashboard.cohere.com/api-keys', freeTier: 'Free trial key', blurb: 'Command models via compatibility API.',
    models: [m('command-a-03-2025', { priceIn: 2.5, priceOut: 10 }), m('command-r-plus-08-2024', { priceIn: 2.5, priceOut: 10 })] },
  { id: 'github', name: 'GitHub Models', kind: 'openai', baseUrl: 'https://models.github.ai/inference', keyUrl: 'https://github.com/settings/personal-access-tokens', freeTier: 'Free with a GitHub token (models:read)', blurb: 'Prototype with a GitHub PAT.',
    models: [m('openai/gpt-4.1', { vision: true }), m('openai/gpt-4o', { vision: true }), m('meta/Llama-3.3-70B-Instruct'), m('deepseek/DeepSeek-V3-0324')] },
  { id: 'ollama', name: 'Ollama (local)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', local: true, noKey: true, userModels: true, freeTier: 'Free – runs on your machine', blurb: 'Run `OLLAMA_ORIGINS=* ollama serve` to allow browser access.',
    models: [m('qwen2.5-coder:7b'), m('llama3.2'), m('deepseek-r1:8b', { reasoning: true })] },
  { id: 'lmstudio', name: 'LM Studio (local)', kind: 'openai', baseUrl: 'http://localhost:1234/v1', local: true, noKey: true, userModels: true, freeTier: 'Free – runs on your machine', blurb: 'Enable “Serve on local network” + CORS in LM Studio.',
    models: [m('local-model')] },
  { id: 'custom', name: 'Custom OpenAI-compatible', kind: 'openai', baseUrl: 'https://your-endpoint.example.com/v1', userModels: true, blurb: 'Any endpoint that speaks /chat/completions with CORS enabled.',
    models: [] },
]

export const getProvider = (id: string) => PROVIDERS.find((p) => p.id === id)
export const findModel = (providerId: string, modelId: string) => getProvider(providerId)?.models.find((x) => x.id === modelId)
