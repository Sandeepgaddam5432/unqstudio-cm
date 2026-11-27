import { BRAND_SVGS, type BrandKey } from './brandSvgs'

/** Model ID / display name → the model's OWN AI family glyph (so `anthropic/claude-*` on OpenRouter shows Claude, not OpenRouter). */
const FAMILY_RULES: [RegExp, BrandKey][] = [
  [/deepseek/, 'deepseek'], // before llama/qwen so "deepseek-r1-distill-llama" stays DeepSeek
  [/claude/, 'claude'],
  [/gemini|gemma/, 'gemini'],
  [/kimi|moonshot/, 'kimi'],
  [/llama/, 'meta'],
  [/qwen|qwq/, 'qwen'],
  [/mistral|mixtral|codestral|pixtral|ministral|devstral|magistral/, 'mistral'],
  [/grok/, 'xai'],
  [/(^|[^a-z])command([^a-z]|$)|c4ai/, 'cohere'],
  [/glm|zhipu/, 'zhipu'],
  [/minimax/, 'minimax'],
  [/sonar/, 'perplexity'],
  [/nemotron/, 'nvidia'],
  [/(^|[^a-z0-9])yi-/, 'yi'],
  [/gpt|chatgpt|davinci|(^|[/:\s])o[134](-|$|:|\s)|codex/, 'openai'],
]

export function detectModelFamily(modelId: string, modelName?: string): BrandKey | null {
  const hay = `${modelId} ${modelName ?? ''}`.toLowerCase()
  for (const [re, key] of FAMILY_RULES) if (re.test(hay)) return key
  return null
}

/** Provider id (built-in id or directory id) → bundled brand glyph, or null → CDN/monogram layers. */
const PROVIDER_RULES: [RegExp, BrandKey][] = [
  [/^(gemini|google-ai|google-ai-studio)$/, 'gemini'],
  [/^google/, 'google'],
  [/^anthropic/, 'anthropic'],
  [/^openai/, 'openai'],
  [/^moonshot/, 'moonshot'],
  [/^deepseek/, 'deepseek'],
  [/^openrouter/, 'openrouter'],
  [/^groq/, 'groq'],
  [/^(xai|x-ai)/, 'xai'],
  [/^mistral/, 'mistral'],
  [/^(meta|llama)/, 'meta'],
  [/^(alibaba|qwen|dashscope)/, 'qwen'],
  [/^cohere/, 'cohere'],
  [/^perplexity/, 'perplexity'],
  [/^together/, 'together'],
  [/^fireworks/, 'fireworks'],
  [/^cerebras/, 'cerebras'],
  [/^ollama/, 'ollama'],
  [/^lm-?studio/, 'lmstudio'],
  [/^(huggingface|hf)/, 'huggingface'],
  [/^github/, 'github'],
  [/^deepinfra/, 'deepinfra'],
  [/^venice/, 'venice'],
  [/^vercel/, 'vercel'],
  [/^nvidia/, 'nvidia'],
  [/^sambanova/, 'sambanova'],
  [/^(zhipu|zai|z-ai|glm)/, 'zhipu'],
  [/^minimax/, 'minimax'],
  [/^(yi|01-ai|lingyi)/, 'yi'],
  [/^novita/, 'novita'],
  [/^hyperbolic/, 'hyperbolic'],
  [/^silicon/, 'siliconflow'],
  [/^(custom|plugin:)/, 'custom'],
]

export function providerBrandKey(providerId: string): BrandKey | null {
  const id = providerId.toLowerCase()
  for (const [re, key] of PROVIDER_RULES) if (re.test(id)) return key
  return null
}

export const isBrandKey = (k: string | undefined | null): k is BrandKey => !!k && k in BRAND_SVGS

/** Deterministic, tasteful brand colour for the monogram fallback (same input → same hue, always). */
export function monogramHue(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) }
  return Math.abs(h) % 360
}

/** Clean 2-letter monogram: initials of the first two words, else the first two letters. */
export function monogramText(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s/_.-]/gu, '').split(/[\s/_.-]+/).filter(Boolean)
  const t = words.length >= 2 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2)
  return t.toUpperCase()
}

/** Layer-2 CDN candidate for long-tail providers (never trusted: the image is preloaded and discarded on failure). */
export const cdnIconUrl = (providerId: string, colour = false): string => `https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/${providerId.toLowerCase().replace(/[^a-z0-9]/g, '')}${colour ? '-color' : ''}.svg`
