// Derives brand assets in public/ from the official public/logo.svg (https://unqtools.pages.dev/logo.svg).
// Run: node scripts/gen-brand-assets.mjs   (needs Playwright chromium)
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const logo = readFileSync('public/logo.svg', 'utf8')
if (!/<svg[\s>]/.test(logo)) throw new Error('public/logo.svg is not a valid SVG')
const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(logo).toString('base64')
const png = /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(logo)?.[1]

// favicon.svg — the official mark clipped to a rounded square (derived, self-contained).
writeFileSync('public/favicon.svg', png
  ? `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32"><clipPath id="c"><rect width="32" height="32" rx="7"/></clipPath><image clip-path="url(#c)" width="32" height="32" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/png;base64,${png}"/></svg>`
  : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><image width="32" height="32" href="${dataUri}"/></svg>`)

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const shot = async (w, h, html, out, omit = false) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.setContent(`<style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}</style>${html}`)
  await page.waitForTimeout(200)
  await page.screenshot({ path: out, omitBackground: omit })
  await page.close()
}
const icon = (s, pad, radius) => `<div style="width:${s}px;height:${s}px;background:#09090B;display:flex;align-items:center;justify-content:center"><img src="${dataUri}" style="width:${s - pad * 2}px;height:${s - pad * 2}px;border-radius:${radius}px;image-rendering:auto"></div>`
await shot(180, 180, icon(180, 14, 34), 'public/apple-touch-icon.png')
await shot(192, 192, icon(192, 0, 0), 'public/icon-192.png')
await shot(512, 512, icon(512, 0, 0), 'public/icon-512.png')
await shot(1200, 630, `
<div style="width:1200px;height:630px;position:relative;background:radial-gradient(900px 500px at 78% 0%,rgba(255,106,61,.20),transparent 60%),radial-gradient(700px 500px at 0% 100%,rgba(99,102,241,.18),transparent 60%),#09090B;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#FAFAFA;display:flex;align-items:center;padding:0 92px;box-sizing:border-box">
  <div style="position:absolute;inset:28px;border:1px solid rgba(255,255,255,.08);border-radius:28px"></div>
  <img src="${dataUri}" style="width:280px;height:280px;border-radius:64px;box-shadow:0 30px 80px rgba(255,106,61,.25),0 0 0 1px rgba(255,255,255,.1)">
  <div style="margin-left:72px;max-width:640px">
    <div style="font-size:84px;font-weight:700;letter-spacing:-3px;line-height:1">UnQStudio</div>
    <div style="margin-top:22px;font-size:34px;line-height:1.3;color:#A1A1AA">Describe it. Watch it build.<br>The browser-native AI coding studio.</div>
    <div style="margin-top:34px;display:flex;gap:12px;font-size:22px;color:#D4D4D8"><span style="padding:8px 18px;border:1px solid rgba(255,255,255,.14);border-radius:999px">Free · BYOK</span><span style="padding:8px 18px;border:1px solid rgba(255,255,255,.14);border-radius:999px">No backend</span><span style="padding:8px 18px;border:1px solid rgba(255,255,255,.14);border-radius:999px">300+ providers</span></div>
  </div>
</div>`, 'public/og-image.png')
await browser.close()
console.log('brand assets generated')
