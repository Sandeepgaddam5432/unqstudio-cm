// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatLeaks, publishBlockers, scanFiles, shannonEntropy } from './leakScanner'

// Fixtures are assembled at runtime so no literal key-shaped strings live in the repo (push protection / our own scanner).
const b64u = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const FX = {
  openai: 'sk-' + 'A'.repeat(30), anthropic: 'sk-ant-' + 'b'.repeat(30), ghp: 'ghp_' + 'c'.repeat(36), pat: 'github_' + 'pat_' + 'd'.repeat(30),
  google: 'AI' + 'za' + 'e'.repeat(35), stripe: 'sk_' + 'live_' + 'f'.repeat(24), aws: 'AK' + 'IA' + 'G'.repeat(16), pem: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
  service: b64u({ alg: 'HS256' }) + '.' + b64u({ role: 'service_role' }) + '.' + 'sig'.repeat(5), anon: b64u({ alg: 'HS256' }) + '.' + b64u({ role: 'anon' }) + '.' + 'sig'.repeat(5),
}

describe('leak scanner', () => {
  it('detects every provider pattern with exact file + line and masked previews', () => {
    const f = scanFiles({ '/src/a.ts': `const a = 1\nconst k = "${FX.openai}"\nfetch(u, { headers: { x: '${FX.anthropic}' } })`, '/src/b.ts': [FX.ghp, FX.pat, FX.google, FX.stripe, FX.aws, FX.pem].join('\n') })
    const kinds = f.map((x) => `${x.file}:${x.line}:${x.kind}`)
    expect(kinds).toEqual(expect.arrayContaining(['/src/a.ts:2:openai-key', '/src/a.ts:3:anthropic-key', '/src/b.ts:1:github-token', '/src/b.ts:2:github-token', '/src/b.ts:3:google-api-key', '/src/b.ts:4:stripe-live-key', '/src/b.ts:5:aws-access-key', '/src/b.ts:6:private-key']))
    expect(f.find((x) => x.kind === 'anthropic-key')!.kind).not.toBe('openai-key') // sk-ant- is not double-reported as openai
    expect(f.filter((x) => x.line === 3 && x.file === '/src/a.ts')).toHaveLength(1)
    expect(f[0].preview).not.toContain(FX.openai)
    expect(f.every((x) => x.severity === 'block')).toBe(true)
  })
  it('flags a Supabase service_role JWT but not the anon key', () => {
    expect(scanFiles({ '/src/s.ts': `const k = '${FX.service}'` }).map((x) => x.kind)).toEqual(['supabase-service-role'])
    expect(scanFiles({ '/src/s.ts': `const k = '${FX.anon}'` })).toEqual([])
  })
  it('.env: VITE_ secrets block, high-entropy values warn, public values pass', () => {
    const env = ['VITE_SUPABASE_URL=https://x.supabase.co', 'VITE_SERVICE_ROLE_KEY=abc123', 'RANDOM_BLOB=aB3dE5gH7jK9mN1pQ2sT4vW6yZ8cF0xR', 'APP_NAME=hello', '# VITE_TOKEN=commented'].join('\n')
    const f = scanFiles({ '/.env': env })
    expect(f.map((x) => [x.line, x.kind, x.severity])).toEqual([[2, 'client-env-secret', 'block'], [3, 'high-entropy', 'warn']])
    expect(publishBlockers(f)).toHaveLength(1)
    expect(formatLeaks(f)).toMatch(/\/\.env:2 \[client-env-secret\]/)
  })
  it('ignores node_modules/dist and clean code; entropy sanity', () => {
    expect(scanFiles({ '/node_modules/x/index.js': FX.openai, '/src/ok.ts': 'export const a = "hello world"' })).toEqual([])
    expect(shannonEntropy('aaaa')).toBe(0)
    expect(shannonEntropy('abcdefgh')).toBeCloseTo(3, 5)
  })
})
