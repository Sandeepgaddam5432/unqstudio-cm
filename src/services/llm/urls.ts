/** Base-URL normalisation + proxy-routing defaults for custom providers (v3.3). Pure — unit-tested. */
export const LOCAL_URL_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?=[:/?#]|$)/i
export const isLocalUrl = (u: string): boolean => LOCAL_URL_RE.test(u.trim())

/** Trim, drop query/hash, trailing slashes and a pasted endpoint suffix (`/chat/completions`, `/models`, `/messages`). */
export function normalizeBaseUrl(input: string): string {
  let s = (input ?? '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '')
  s = s.replace(/\/(chat\/completions|completions|models|messages)$/i, '').replace(/\/+$/, '')
  return s
}

/** `…/v1`, `…/api/v2`, `…/v1beta`, `…/v1/openai` already carry an API version segment. */
export const hasVersionSegment = (base: string): boolean => /\/v\d+(beta)?(\/openai)?$/i.test(base)

/** Ordered `/models` probes: `{base}/models`, then `{base}/v1/models` when the base has no version segment. */
export function modelsUrlCandidates(base: string): string[] {
  const b = normalizeBaseUrl(base)
  if (!b) return []
  return hasVersionSegment(b) ? [`${b}/models`] : [`${b}/models`, `${b}/v1/models`]
}

export const chatCompletionsUrl = (base: string): string => `${normalizeBaseUrl(base)}/chat/completions`

/** Proxy defaults: ON for every non-local https endpoint, OFF for localhost / 127.0.0.1 / plain http. */
export const shouldProxyByDefault = (baseUrl: string): boolean => /^https:\/\//i.test(baseUrl.trim()) && !isLocalUrl(baseUrl)
export const effectiveViaProxy = (c: { viaProxy?: boolean; baseUrl: string }): boolean => c.viaProxy ?? shouldProxyByDefault(c.baseUrl)
