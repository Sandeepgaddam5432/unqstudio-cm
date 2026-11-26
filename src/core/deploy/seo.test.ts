import { describe, expect, it } from 'vitest'
import { applySeo, faviconHref, readSeo } from './seo'

const HTML = `<!doctype html><html><head><meta charset="UTF-8" /><title>Old</title><meta name="description" content="old d" /><link rel="icon" href="/favicon.svg" /></head><body><div id="root"></div></body></html>`

describe('SEO meta updater for generated index.html', () => {
  it('reads existing title, description and favicon', () => {
    expect(readSeo(HTML)).toEqual({ title: 'Old', description: 'old d', favicon: '/favicon.svg' })
  })
  it('updates title/description in place and adds OG + Twitter tags', () => {
    const out = applySeo(HTML, { title: 'My <App> & Co', description: 'Fast "tools"', favicon: '' })
    expect(out).toContain('<title>My &lt;App&gt; &amp; Co</title>')
    expect(out).toContain('<meta name="description" content="Fast &quot;tools&quot;" />')
    expect(out).toContain('property="og:title"')
    expect(out).toContain('name="twitter:description"')
    expect(out.match(/<title>/g)).toHaveLength(1)
    expect(out).toContain('<link rel="icon" href="/favicon.svg" />')
    expect(readSeo(out).title).toBe('My <App> & Co')
  })
  it('is idempotent and does not duplicate tags on a second apply', () => {
    const once = applySeo(HTML, { title: 'A', description: 'B', favicon: '🚀' })
    expect(applySeo(once, { title: 'A', description: 'B', favicon: '🚀' })).toBe(once)
    expect(once.match(/og:title/g)).toHaveLength(1)
  })
  it('converts an emoji favicon to an inline SVG icon and round-trips it', () => {
    const out = applySeo(HTML, { title: 'T', description: '', favicon: '🚀' })
    expect(out).toContain('href="data:image/svg+xml,')
    expect(readSeo(out).favicon).toBe('🚀')
  })
  it('rejects hostile favicon values and inserts into a head-less document', () => {
    expect(faviconHref('javascript:alert(1)')).toBe('')
    expect(faviconHref('<script>')).toBe('')
    expect(faviconHref('https://x.dev/i.png')).toBe('https://x.dev/i.png')
    expect(applySeo('<div></div>', { title: 'Z', description: '', favicon: '' })).toContain('<title>Z</title>')
  })
})
