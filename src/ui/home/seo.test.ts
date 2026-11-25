import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { FAQ } from './AboutFaq'

const html = readFileSync('index.html', 'utf8')
const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))

describe('SEO / AEO assets', () => {
  it('index.html has title, description, canonical, OG, Twitter, theme-color, manifest', () => {
    for (const re of [/<title>[^<]{20,}<\/title>/, /name="description"/, /rel="canonical"/, /property="og:title"/, /property="og:image"/, /name="twitter:card"/, /name="theme-color"[^>]*dark/, /name="theme-color"[^>]*light/, /rel="manifest"/, /rel="apple-touch-icon"/]) expect(html).toMatch(re)
  })
  it('JSON-LD blocks parse and cover SoftwareApplication, Organization, WebSite, FAQPage', () => {
    expect(ld.map((x) => x['@type']).sort()).toEqual(['FAQPage', 'Organization', 'SoftwareApplication', 'WebSite'])
    const app = ld.find((x) => x['@type'] === 'SoftwareApplication')
    expect(app.applicationCategory).toBe('DeveloperApplication')
    expect(app.offers.price).toBe('0')
    expect(app.featureList.length).toBeGreaterThan(5)
  })
  it('FAQPage JSON-LD mirrors the visible FAQ questions', () => {
    const faq = ld.find((x) => x['@type'] === 'FAQPage')
    expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(FAQ.map((f) => f.q))
  })
  it('static SEO files and brand assets exist; logo is a valid SVG', () => {
    for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt', 'manifest.webmanifest', 'logo.svg', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'og-image.png']) expect(existsSync(`public/${f}`), f).toBe(true)
    expect(readFileSync('public/logo.svg', 'utf8')).toMatch(/<svg[\s>]/)
    expect(JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')).icons.length).toBeGreaterThanOrEqual(3)
    expect(readFileSync('public/robots.txt', 'utf8')).toMatch(/Sitemap:/)
    expect(readFileSync('public/llms.txt', 'utf8')).toMatch(/^# UnQStudio/)
  })
})
