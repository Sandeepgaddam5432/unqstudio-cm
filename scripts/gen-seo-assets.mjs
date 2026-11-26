// Dynamic canonical origin for SEO + AEO. Reads VITE_SITE_URL (process env, then .env / .env.production), trims trailing slashes,
// defaults to https://unqstudio-cm.pages.dev and rewrites the canonical origin everywhere it appears:
//   index.html (canonical, og:url, og:image, twitter:image, JSON-LD), public/robots.txt, sitemap.xml, llms.txt, llms-full.txt.
// Idempotent: the CURRENT origin is detected from <link rel="canonical">, so switching domains again later just works.
// Wired into `prebuild` and `npm run gen:seo`. Set VITE_SITE_URL in Cloudflare Pages → Environment Variables and redeploy.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_SITE_URL = 'https://unqstudio-cm.pages.dev'
export const SEO_FILES = ['index.html', 'public/robots.txt', 'public/sitemap.xml', 'public/llms.txt', 'public/llms-full.txt', 'public/manifest.webmanifest']

/** Trim whitespace + trailing slashes; only http(s) origins/paths are accepted, anything else falls back to the default. */
export function normalizeSiteUrl(v) {
  const s = String(v ?? '').trim().replace(/\/+$/, '')
  if (!s) return DEFAULT_SITE_URL
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? `${u.origin}${u.pathname.replace(/\/+$/, '')}` : DEFAULT_SITE_URL } catch { return DEFAULT_SITE_URL }
}

export const detectOrigin = (html) => /<link\s+rel="canonical"\s+href="(https?:\/\/[^"/]+)/.exec(html)?.[1] ?? null

function envFileVar(root, name) {
  for (const f of ['.env.production', '.env']) {
    const p = join(root, f)
    if (!existsSync(p)) continue
    const m = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm').exec(readFileSync(p, 'utf8'))
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '')
  }
  return undefined
}

export function applySiteUrl(root, target) {
  const htmlPath = join(root, 'index.html')
  const from = existsSync(htmlPath) ? detectOrigin(readFileSync(htmlPath, 'utf8')) : null
  const changed = []
  if (!from || from === target) return { from, to: target, changed }
  for (const f of SEO_FILES) {
    const p = join(root, f)
    if (!existsSync(p)) continue
    const src = readFileSync(p, 'utf8')
    const next = src.split(from).join(target)
    if (next !== src) { writeFileSync(p, next); changed.push(f) }
  }
  return { from, to: target, changed }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = process.env.SEO_ROOT ?? process.cwd()
  const target = normalizeSiteUrl(process.env.VITE_SITE_URL ?? envFileVar(root, 'VITE_SITE_URL'))
  const r = applySiteUrl(root, target)
  console.log(r.changed.length ? `✓ SEO/AEO origin ${r.from} → ${r.to} (${r.changed.join(', ')})` : `✓ SEO/AEO origin already ${r.to}`)
}
