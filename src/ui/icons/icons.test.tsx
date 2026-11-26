import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { BRAND_KEYS } from './brandSvgs'
import { cdnIconUrl, detectModelFamily, monogramHue, monogramText, providerBrandKey } from './modelFamily'
import { ProviderIcon } from './ProviderIcon'
import { ModelIcon } from './ModelIcon'

describe('detectModelFamily — 30 model id patterns', () => {
  it.each([
    ['claude-sonnet-4-5', 'claude'], ['anthropic/claude-opus-4.1', 'claude'], ['claude-3-7-sonnet-latest', 'claude'],
    ['gpt-5', 'openai'], ['gpt-4o-mini', 'openai'], ['chatgpt-4o-latest', 'openai'], ['o1-preview', 'openai'], ['o3', 'openai'], ['openai/o4-mini', 'openai'], ['openai/gpt-oss-120b', 'openai'],
    ['gemini-2.5-pro', 'gemini'], ['models/gemini-2.0-flash', 'gemini'], ['gemma-3-27b-it', 'gemini'],
    ['kimi-k2-0905-preview', 'kimi'], ['moonshotai/kimi-k2-instruct', 'kimi'], ['moonshot-v1-128k', 'kimi'],
    ['deepseek-chat', 'deepseek'], ['deepseek-ai/DeepSeek-V3', 'deepseek'], ['deepseek-r1-distill-llama-70b', 'deepseek'],
    ['llama-3.3-70b-versatile', 'meta'], ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'meta'],
    ['qwen3-coder-480b', 'qwen'], ['Qwen/Qwen2.5-Coder-32B-Instruct', 'qwen'], ['qwq-32b', 'qwen'],
    ['mistral-large-latest', 'mistral'], ['mixtral-8x7b', 'mistral'], ['codestral-latest', 'mistral'], ['pixtral-large-latest', 'mistral'],
    ['grok-4', 'xai'], ['x-ai/grok-code-fast-1', 'xai'],
    ['command-a-03-2025', 'cohere'], ['command-r-plus-08-2024', 'cohere'],
    ['glm-4.6', 'zhipu'], ['z-ai/glm-4.5-air', 'zhipu'], ['MiniMax-M2', 'minimax'], ['minimax/minimax-m1', 'minimax'],
    ['sonar-pro', 'perplexity'], ['sonar-reasoning', 'perplexity'],
  ])('%s → %s', (id, fam) => { expect(detectModelFamily(id)).toBe(fam) })

  it('returns null for unknown families (→ provider icon → monogram)', () => {
    for (const id of ['local-model', 'my-finetune-v2', 'phi-4', 'text-bison']) expect(detectModelFamily(id)).toBeNull()
  })
  it('also reads the display name', () => { expect(detectModelFamily('abc123', 'Claude Haiku')).toBe('claude') })
})

describe('providerBrandKey', () => {
  it('maps built-in and directory ids to bundled glyphs', () => {
    expect(providerBrandKey('openai')).toBe('openai'); expect(providerBrandKey('togetherai')).toBe('together'); expect(providerBrandKey('fireworks-ai')).toBe('fireworks')
    expect(providerBrandKey('github-models')).toBe('github'); expect(providerBrandKey('moonshotai-cn')).toBe('moonshot'); expect(providerBrandKey('zai-coding-plan')).toBe('zhipu')
    expect(providerBrandKey('gemini')).toBe('gemini'); expect(providerBrandKey('plugin:abc')).toBe('custom'); expect(providerBrandKey('some-longtail')).toBeNull()
  })
  it('bundles all 32+ required brands', () => {
    for (const k of ['openai', 'anthropic', 'google', 'moonshot', 'deepseek', 'openrouter', 'groq', 'xai', 'mistral', 'meta', 'qwen', 'cohere', 'perplexity', 'together', 'fireworks', 'cerebras', 'ollama', 'lmstudio', 'huggingface', 'github', 'deepinfra', 'venice', 'vercel', 'nvidia', 'sambanova', 'zhipu', 'minimax', 'yi', 'novita', 'hyperbolic', 'siliconflow', 'custom', 'claude', 'gemini', 'kimi']) expect(BRAND_KEYS).toContain(k)
    expect(BRAND_KEYS.length).toBeGreaterThanOrEqual(32)
  })
})

describe('monogram helpers', () => {
  it('is deterministic and 2 letters', () => {
    expect(monogramHue('Acme AI')).toBe(monogramHue('Acme AI'))
    expect(monogramText('Acme AI')).toBe('AA'); expect(monogramText('zeta')).toBe('ZE'); expect(monogramText('')).toBe('?')
  })
  it('cdn url is sanitized', () => { expect(cdnIconUrl('Foo-Bar_1')).toMatch(/icons\/foobar1\.svg$/) })
})

describe('icon components never render a broken image', () => {
  it('known provider → inline SVG, no <img>', () => {
    const { container } = render(<ProviderIcon id="openai" size={20} />)
    expect(container.querySelector('svg[data-brand="openai"]')).toBeTruthy(); expect(container.querySelector('img')).toBeNull()
  })
  it('long-tail provider → monogram until a CDN glyph actually loads (never an <img> before that)', () => {
    const { container } = render(<ProviderIcon id="obscure-ai" name="Obscure AI" logo="https://example.invalid/x.svg" />)
    expect(container.querySelector('[data-icon-layer="monogram"]')?.textContent).toBe('OA'); expect(container.querySelector('img')).toBeNull()
  })
  it('custom provider honours brand + accent presets', () => {
    const { container } = render(<ProviderIcon id="plugin:x" brand="groq" accent="#ff0000" />)
    expect(container.querySelector('svg[data-brand="groq"]')).toBeTruthy()
  })
  it('ModelIcon prefers the model family over the aggregator, then the provider, then a monogram', () => {
    const a = render(<ModelIcon modelId="anthropic/claude-sonnet-4.5" providerId="openrouter" />)
    expect(a.container.querySelector('svg[data-brand="claude"]')).toBeTruthy()
    const b = render(<ModelIcon modelId="mystery-1" providerId="groq" />)
    expect(b.container.querySelector('svg[data-brand="groq"]')).toBeTruthy()
    const c = render(<ModelIcon modelId="mystery-1" providerId="" modelName="Mystery One" />)
    expect(c.container.querySelector('[data-icon-layer="monogram"]')).toBeTruthy()
  })
})
