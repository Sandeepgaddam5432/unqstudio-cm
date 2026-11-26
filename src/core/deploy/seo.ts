/** Read / write the SEO + social metadata of the generated project's `/index.html` (pure string transforms). */
export interface SeoInfo { title: string; description: string; favicon: string }

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unattr = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** A favicon value: emoji (1–2 grapheme-ish chars) → inline SVG data URL; http(s)/data/relative URLs pass through; anything else is dropped. */
export function faviconHref(input: string): string {
  const v = input.trim()
  if (!v) return ''
  if (/^(https?:|data:image\/|\.{0,2}\/)/i.test(v)) return v
  if ([...v].length <= 4 && !/[<>"'\s]/.test(v)) return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${v}</text></svg>`)}`
  return ''
}

const metaContent = (html: string, key: string) => {
  const m = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, 'i').exec(html)
  const c = m && /content=["']([^"']*)["']/i.exec(m[0])
  return c ? unattr(c[1]!) : ''
}

export function readSeo(html: string): SeoInfo {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const icon = /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/i.exec(html)
  const href = icon && /href=["']([^"']*)["']/i.exec(icon[0])
  let fav = href ? unattr(href[1]!) : ''
  const emoji = /%3Ctext[^"']*?%3E(.+?)%3C%2Ftext/i.exec(fav)
  if (emoji) { try { fav = decodeURIComponent(emoji[1]!) } catch { /* keep raw */ } }
  return { title: t ? unattr(t[1]!.trim()) : '', description: metaContent(html, 'description'), favicon: fav }
}

function upsert(html: string, re: RegExp, tag: string): string {
  if (re.test(html)) return html.replace(re, tag)
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `  ${tag}\n</head>`)
  return tag + '\n' + html
}

/** Update `<title>`, description, Open Graph / Twitter tags and the favicon in an index.html string. */
export function applySeo(html: string, seo: SeoInfo): string {
  const title = seo.title.trim()
  const desc = seo.description.trim().slice(0, 300)
  let out = html
  if (title) {
    out = upsert(out, /<title[^>]*>[\s\S]*?<\/title>/i, `<title>${attr(title)}</title>`)
    out = upsert(out, /<meta[^>]+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${attr(title)}" />`)
    out = upsert(out, /<meta[^>]+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${attr(title)}" />`)
  }
  if (desc) {
    out = upsert(out, /<meta[^>]+name=["']description["'][^>]*>/i, `<meta name="description" content="${attr(desc)}" />`)
    out = upsert(out, /<meta[^>]+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${attr(desc)}" />`)
    out = upsert(out, /<meta[^>]+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${attr(desc)}" />`)
  }
  const fav = faviconHref(seo.favicon)
  if (fav) out = upsert(out, /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/i, `<link rel="icon" href="${attr(fav)}" />`)
  return out
}
