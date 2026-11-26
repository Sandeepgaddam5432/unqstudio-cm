import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FILES = ['index.html', 'public/robots.txt', 'public/sitemap.xml', 'public/llms.txt', 'public/llms-full.txt', 'public/manifest.webmanifest']
function sandbox() {
  const d = mkdtempSync(join(tmpdir(), 'seo-'))
  mkdirSync(join(d, 'public'))
  for (const f of FILES) cpSync(f, join(d, f))
  return d
}
const run = (root: string, url?: string) => execFileSync('node', ['scripts/gen-seo-assets.mjs'], { env: { ...process.env, SEO_ROOT: root, ...(url === undefined ? { VITE_SITE_URL: '' } : { VITE_SITE_URL: url }) }, encoding: 'utf8' })
const read = (root: string, f: string) => readFileSync(join(root, f), 'utf8')

describe('gen-seo-assets (VITE_SITE_URL)', () => {
  it('rewrites the canonical origin everywhere and trims the trailing slash', () => {
    const d = sandbox()
    const out = run(d, 'https://customdomain.com/')
    expect(out).toContain('customdomain.com')
    const html = read(d, 'index.html')
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/customdomain\.com\/?"/)
    expect(html).toMatch(/property="og:url" content="https:\/\/customdomain\.com/)
    expect(html).toMatch(/property="og:image" content="https:\/\/customdomain\.com\/og-image\.png"/)
    expect(html).toMatch(/name="twitter:image" content="https:\/\/customdomain\.com\//)
    expect(html).toContain('"url": "https://customdomain.com')
    expect(read(d, 'public/robots.txt')).toContain('Sitemap: https://customdomain.com/sitemap.xml')
    expect(read(d, 'public/sitemap.xml')).toContain('<loc>https://customdomain.com/</loc>')
    for (const f of FILES) { expect(read(d, f)).not.toContain('unqstudio-cm.pages.dev'); expect(read(d, f)).not.toContain('unqstudio.pages.dev') }
    expect(read(d, 'public/llms.txt')).toContain('https://customdomain.com')
  })
  it('is idempotent and can switch domains again', () => {
    const d = sandbox()
    run(d, 'https://a.example.org'); const once = read(d, 'index.html')
    expect(run(d, 'https://a.example.org')).toContain('already'); expect(read(d, 'index.html')).toBe(once)
    run(d, 'https://b.example.org/'); expect(read(d, 'index.html')).not.toContain('a.example.org'); expect(read(d, 'public/sitemap.xml')).toContain('https://b.example.org/')
  })
  it('defaults to https://unqstudio-cm.pages.dev when unset or invalid', () => {
    const d = sandbox(); run(d)
    expect(read(d, 'index.html')).toContain('<link rel="canonical" href="https://unqstudio-cm.pages.dev/"')
    const e = sandbox(); run(e, 'javascript:alert(1)'); expect(read(e, 'index.html')).toContain('https://unqstudio-cm.pages.dev')
  })
})
