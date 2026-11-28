/** Live secret-leak scanner: high-precision patterns + entropy for `.env` values. Pure; callers decide what to block. */
export type LeakKind = 'openai-key' | 'anthropic-key' | 'github-token' | 'google-api-key' | 'stripe-live-key' | 'aws-access-key' | 'supabase-service-role' | 'private-key' | 'client-env-secret' | 'high-entropy'
export interface LeakFinding { file: string; line: number; kind: LeakKind; severity: 'block' | 'warn'; preview: string; remediation: string }

const PATTERNS: { kind: LeakKind; re: RegExp; fix: string }[] = [
  { kind: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, fix: 'Revoke the key in the Anthropic console and call the API from a server/edge function.' },
  { kind: 'openai-key', re: /\bsk-(?!ant-)[A-Za-z0-9_-]{20,}/g, fix: 'Revoke the key at OpenAI and proxy requests through a server/edge function.' },
  { kind: 'github-token', re: /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})/g, fix: 'Revoke the token in GitHub → Settings → Developer settings.' },
  { kind: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, fix: 'Restrict the key by HTTP referrer / API in Google Cloud, or move it server-side.' },
  { kind: 'stripe-live-key', re: /\bsk_live_[0-9a-zA-Z]{24,}/g, fix: 'Roll the key in the Stripe dashboard; only publishable (pk_) keys may reach the browser.' },
  { kind: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g, fix: 'Deactivate the access key in IAM and use short-lived credentials server-side.' },
  { kind: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g, fix: 'Remove the private key from the project and rotate it.' },
]
const mask = (s: string) => (s.length <= 10 ? '•'.repeat(s.length) : `${s.slice(0, 6)}…${s.slice(-2)}`)
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g

export function shannonEntropy(s: string): number {
  if (!s) return 0
  const f = new Map<string, number>()
  for (const c of s) f.set(c, (f.get(c) ?? 0) + 1)
  let h = 0
  for (const n of f.values()) { const p = n / s.length; h -= p * Math.log2(p) }
  return h
}
function jwtRole(payloadB64: string): string | undefined {
  try { return JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))).role } catch { return undefined }
}

/** Scan source files (path → text). `.env*` files additionally get client-var and entropy checks. */
export function scanFiles(files: Record<string, string>): LeakFinding[] {
  const out: LeakFinding[] = []
  for (const [file, text] of Object.entries(files)) {
    if (/^\/(node_modules|dist)\//.test(file)) continue
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      for (const p of PATTERNS) for (const m of line.matchAll(p.re)) out.push({ file, line: i + 1, kind: p.kind, severity: 'block', preview: mask(m[0]), remediation: p.fix })
      for (const m of line.matchAll(JWT)) if (jwtRole(m[1]) === 'service_role') out.push({ file, line: i + 1, kind: 'supabase-service-role', severity: 'block', preview: mask(m[0]), remediation: 'The service_role key bypasses Row Level Security. Rotate it and use only the anon key in the browser.' })
    })
    if (/(^|\/)\.env(\.|$)/.test(file)) lines.forEach((line, i) => {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (!m || line.trim().startsWith('#')) return
      const [, key, raw] = m
      const val = raw.trim().replace(/^["']|["']$/g, '')
      if (/^VITE_/.test(key) && /(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN)/i.test(key) && val) out.push({ file, line: i + 1, kind: 'client-env-secret', severity: 'block', preview: `${key}=${mask(val)}`, remediation: 'VITE_* variables are compiled into the public bundle. Remove the VITE_ prefix and read it from a server/edge function.' })
      else if (val.length >= 24 && !/^https?:/.test(val) && shannonEntropy(val) > 4.2 && !PATTERNS.some((p) => new RegExp(p.re.source).test(val))) out.push({ file, line: i + 1, kind: 'high-entropy', severity: 'warn', preview: `${key}=${mask(val)}`, remediation: /^VITE_/.test(key) ? 'This looks like a secret and is exposed to the browser (VITE_). Confirm it is a public/anon value.' : 'High-entropy value: keep it out of client code and never commit it.' })
    })
  }
  return out
}

/** Findings that must stop a publish / git push / deploy. */
export const publishBlockers = (f: LeakFinding[]): LeakFinding[] => f.filter((x) => x.severity === 'block')
export const formatLeaks = (f: LeakFinding[]): string => f.map((x) => `${x.file}:${x.line} [${x.kind}] ${x.preview} — ${x.remediation}`).join('\n')
