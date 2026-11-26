import { BrandGlyph, Monogram, ProviderIcon } from './ProviderIcon'
import { detectModelFamily } from './modelFamily'

export interface ModelIconProps {
  modelId: string
  modelName?: string
  providerId: string
  providerName?: string
  providerLogo?: string
  /** Custom-provider preset overrides, forwarded to the provider fallback. */
  brand?: string
  accent?: string
  size?: number
  className?: string
}

/**
 * The model's OWN family glyph (Claude inside OpenRouter, Llama inside Groq…) → else the parent ProviderIcon → else a monogram.
 */
export function ModelIcon({ modelId, modelName, providerId, providerName, providerLogo, brand, accent, size = 16, className }: ModelIconProps) {
  const fam = detectModelFamily(modelId, modelName)
  if (fam) return <BrandGlyph brand={fam} size={size} className={className} />
  if (providerId) return <ProviderIcon id={providerId} name={providerName} logo={providerLogo} brand={brand} accent={accent} size={size} className={className} />
  return <Monogram name={modelName || modelId} size={size} className={className} />
}
