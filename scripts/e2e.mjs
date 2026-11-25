// Headless Chromium verification against the production build (`npm run build` first).
// Usage: npm run e2e   (requires: npx playwright install chromium)
// Covers v1.0 guarantees + v2.0: dropdown anchoring, zero-overlap chat, models.dev registry + live fetch, SEO/AEO assets, auth UI.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4173
const URL = `http://localhost:${PORT}/`
const OUT = process.env.E2E_SHOTS ?? 'DOCS/screenshots'
mkdirSync(OUT, { recursive: true })

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 50; i++) { try { if ((await fetch(URL)).ok) break } catch {} await sleep(200) }

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`) }
const section = async (name, fn) => { try { await fn() } catch (e) { check(`${name} completed`, false, String(e).slice(0, 700)) } }
const errors = []
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`))
}

// ── in-page geometry helpers ────────────────────────────────────────────────
const geometry = () => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height } }
  const hit = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1
  const q = (s) => document.querySelector(s)
  const header = q('[data-chat-header]'), msgs = q('[data-chat-messages]'), comp = q('[data-chat-composer]'), area = q('[data-chat-composer] textarea'), tb = q('[data-composer-toolbar]'), root = q('[data-chat-root]')
  if (!header || !msgs || !comp || !area || !tb || !root) return { missing: true }
  const zones = [['header', header], ['messages', msgs], ['composer', comp]].map(([n, e]) => [n, r(e)])
  const zoneOverlap = []
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) if (hit(zones[i][1], zones[j][1])) zoneOverlap.push(`${zones[i][0]}×${zones[j][0]}`)
  const btns = [...tb.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => [b.getAttribute('aria-label') || b.textContent.trim().slice(0, 12), r(b)])
  const btnOverlap = []
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) if (hit(btns[i][1], btns[j][1])) btnOverlap.push(`${btns[i][0]}×${btns[j][0]}`)
  const cr = r(comp)
  const outside = btns.filter(([, b]) => b.l < cr.l - 1 || b.r > cr.r + 1).map(([n]) => n)
  const ta = r(area), tbr = r(tb)
  const overflowers = [root, header, msgs, comp, area, tb, document.documentElement].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.tagName + (e.dataset ? Object.keys(e.dataset).join(',') : ''))
  const pill = q('[data-model-pill]'); const pr = pill ? r(pill) : null
  return { zoneOverlap, btnOverlap, outside, overflowers, textareaAboveToolbar: ta.b <= tbr.t + 1, buttons: btns.length, pillInside: !!pr && pr.r <= cr.r + 1 && pr.l >= cr.l - 1, vw: innerWidth }
}
const auditChat = async (page, label) => {
  const g = await page.evaluate(geometry)
  check(`${label}: chat zones (header / messages / composer) do not overlap`, !g.missing && g.zoneOverlap.length === 0, JSON.stringify(g.zoneOverlap))
  check(`${label}: textarea sits above the toolbar row`, g.textareaAboveToolbar)
  check(`${label}: zero overlap between ${g.buttons} composer action buttons`, g.btnOverlap.length === 0, g.btnOverlap.join(', '))
  check(`${label}: composer buttons + model pill stay inside the composer`, g.outside.length === 0 && g.pillInside, g.outside.join(', '))
  check(`${label}: zero horizontal overflow (scrollWidth <= clientWidth)`, g.overflowers.length === 0, g.overflowers.join(', '))
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
try {
  // Deterministic network: serve the registry through the "edge" tier, mock a live provider /models endpoint.
  const registryJson = readFileSync('public/models-registry.json', 'utf8')
  const wire = async (ctx) => {
    await ctx.route('**/api/models-dev', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: registryJson }))
    await ctx.route('https://api.groq.com/openai/v1/models', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify({ data: [{ id: 'e2e-model-alpha' }, { id: 'llama-3.3-70b-versatile' }] }) }))
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await wire(ctx)
  const page = await ctx.newPage()
  watch(page, 'desktop')

  // ── A. Home · logo · SEO/AEO · registry · auth UI ─────────────────────────
  await section('home', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' })
    check('home loads with hero', await page.getByText('Describe it.').isVisible())
    check('8 starter templates listed', (await page.locator('button:has(svg)', { hasText: /Blank Starter|SaaS Landing Page|Analytics Dashboard|Designer Portfolio|Product Storefront|AI Chat App|Kanban Board|Editorial Blog/ }).count()) === 8)
    const logo = await page.evaluate(async () => { const img = document.querySelector('img[alt="UnQStudio logo"]'); const r = await fetch('logo.svg'); return { ok: r.status === 200, type: r.headers.get('content-type'), text: (await r.text()).slice(0, 5), shown: !!img && img.naturalWidth > 0 } })
    check('official /logo.svg serves 200 as SVG and renders in the header', logo.ok && /svg/.test(logo.type ?? '') && logo.text.startsWith('<svg') && logo.shown)
    const ld = await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)['@type']))
    check('JSON-LD parses (SoftwareApplication, Organization, WebSite, FAQPage)', ['SoftwareApplication', 'Organization', 'WebSite', 'FAQPage'].every((t) => ld.includes(t)), ld.join(','))
    const files = ['llms.txt', 'llms-full.txt', 'robots.txt', 'sitemap.xml', 'manifest.webmanifest', 'og-image.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'favicon.svg', 'models-registry.json']
    const served = await page.evaluate(async (fs) => Promise.all(fs.map(async (f) => (await fetch(f)).status)), files)
    check('SEO/brand assets are served with 200', served.every((s) => s === 200), served.join(','))
    check('dist/ contains llms.txt, robots.txt, sitemap.xml, manifest.webmanifest', ['llms.txt', 'robots.txt', 'sitemap.xml', 'manifest.webmanifest'].every((f) => existsSync(`dist/${f}`)))
    check('semantic landmarks present (header, nav, main, footer)', (await page.locator('header[role=banner], main, nav[aria-label=Primary], footer[aria-label]').count()) >= 4)
    await page.locator('[data-about-faq] summary').click()
    check('About & FAQ drawer expands with FAQ answers', await page.getByText('Does UnQStudio have a backend?').isVisible())
    const reg = await page.evaluate(async () => { const j = await (await fetch('models-registry.json')).json(); return { p: j.providers.length, m: j.providers.reduce((n, x) => n + x.models.length, 0) } })
    check('bundled models-registry.json has >30 providers and hundreds of models', reg.p > 30 && reg.m > 300, `${reg.p} providers / ${reg.m} models`)
    await page.screenshot({ path: `${OUT}/v2-home.png` })
    // auth modal
    await page.locator('[data-account-signin]').click()
    await page.locator('[data-auth-modal]').waitFor()
    check('Sign-in modal shows Continue with Google + GitHub', (await page.getByText('Continue with Google').isVisible()) && (await page.getByText('Continue with GitHub').isVisible()))
    check('unconfigured providers show an honest "not configured" badge (no crash)', (await page.getByText('not configured').count()) >= 1)
    await page.locator('[data-auth-google]').click()
    await page.locator('[data-auth-guide="google"]').waitFor()
    check('unconfigured Google opens the 3-step setup guide', (await page.locator('[data-auth-guide] ol li').count()) === 3)
    await page.keyboard.press('Escape')
    await page.locator('[data-auth-guide]').waitFor({ state: 'detached' }).catch(() => {})
  })

  // ── B. Desktop studio ─────────────────────────────────────────────────────
  await section('studio', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /SaaS Landing Page/ }).click()
    await page.getByRole('button', { name: 'Create project' }).click()
    await page.waitForURL(/#\/p\//)
    const frame = page.frameLocator('iframe[title="Live preview"]')
    await frame.locator('h1').first().waitFor({ timeout: 90_000 })
    const h1 = await frame.locator('h1').first().textContent()
    check('SaaS template compiled by esbuild-wasm and rendered in the sandboxed iframe', /Know what your product is doing/.test(h1 ?? ''), h1 ?? '')
    await sleep(2500)
    const bg = await frame.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)
    const accent = await frame.locator('a:has-text("Get started")').first().evaluate((el) => getComputedStyle(el).backgroundColor)
    check('Tailwind runtime styled the preview (accent button has a colour)', accent !== 'rgba(0, 0, 0, 0)' && accent !== bg, `${accent} on ${bg}`)
    await page.screenshot({ path: `${OUT}/v2-studio-desktop.png` })
    await auditChat(page, 'desktop 1440×900')

    // long unbroken text must not overflow the composer
    await page.getByPlaceholder(/Ask for a change/).fill('x'.repeat(400) + ' @src/very/long/path/' + 'segment-'.repeat(20) + 'Component.tsx')
    await auditChat(page, 'desktop 1440×900 (400-char unbroken input)')
    await page.getByPlaceholder(/Ask for a change/).fill('')

    // model picker: stays anchored to the trigger
    const pill = page.locator('[data-model-pill]').first()
    await pill.click()
    const panel = page.locator('[data-dropdown-panel]')
    await panel.waitFor()
    const anchored = async () => {
      const t = await pill.boundingBox(), p = await panel.boundingBox(), vp = page.viewportSize()
      const inside = p.x >= -1 && p.y >= -1 && p.x + p.width <= vp.width + 1 && p.y + p.height <= vp.height + 1
      const vertical = Math.abs(p.y + p.height - t.y) <= 14 || Math.abs(p.y - (t.y + t.height)) <= 14
      const horizontal = p.x <= t.x + t.width && p.x + p.width >= t.x
      return { ok: inside && vertical && horizontal, p, t }
    }
    let a = await anchored()
    check('model picker opens anchored to its trigger and inside the viewport', a.ok, JSON.stringify({ p: a.p, t: a.t }))
    await page.locator('[data-chat-messages]').evaluate((el) => { el.scrollTop = 500 })
    await page.mouse.move(700, 450); await page.mouse.wheel(0, 400); await sleep(250)
    a = await anchored()
    check('picker stays anchored after page/container scroll', a.ok)
    await page.setViewportSize({ width: 1440, height: 640 }); await sleep(350)
    a = await anchored()
    check('picker re-anchors and stays inside the viewport after a resize', a.ok, JSON.stringify(a.p))
    await page.evaluate(() => { document.querySelector('[data-chat-composer]').style.transform = 'translateY(-90px)' }); await sleep(450)
    a = await anchored()
    check('picker FOLLOWS the trigger when the trigger moves (autoUpdate)', a.ok, JSON.stringify({ p: a.p, t: a.t }))
    await page.evaluate(() => { document.querySelector('[data-chat-composer]').style.transform = '' })
    await page.setViewportSize({ width: 1440, height: 900 }); await sleep(300)
    // tabs + registry
    const tabs = ['Configured ⭐', 'Browser-Ready 🟢', 'Local 💻', 'All (models.dev)']
    for (const t of tabs) check(`picker tab "${t}" exists`, (await page.getByRole('tab', { name: t }).count()) === 1)
    await page.getByRole('tab', { name: 'Browser-Ready 🟢' }).click()
    const ready = await page.locator('[data-provider-group]').count()
    await page.getByRole('tab', { name: 'Local 💻' }).click()
    const local = await page.locator('[data-provider-group]').count()
    await page.getByRole('tab', { name: 'All (models.dev)' }).click()
    const all = await page.locator('[data-provider-group]').count()
    check('provider filter tabs work (Browser-Ready > Local, All ≥ Browser-Ready, All lists many providers)', ready > local && local >= 2 && all >= ready && all >= 40, `${ready} / ${local} / ${all}`)
    await page.locator('[data-model-picker] input').fill('claude')
    await sleep(200)
    check('picker search finds models across the registry', (await page.locator('[data-picker-list] button:has-text("Claude")').count()) > 0)
    await page.locator('[data-model-picker] input').fill('')
    await page.getByRole('tab', { name: 'Browser-Ready 🟢' }).click()
    check('clicking a filter tab selects it (aria-selected)', (await page.getByRole('tab', { name: 'Browser-Ready 🟢' }).getAttribute('aria-selected')) === 'true' && (await page.getByRole('tab', { name: 'All (models.dev)' }).getAttribute('aria-selected')) === 'false')
    await page.waitForFunction(() => { const t = [...document.querySelectorAll('[data-model-picker] [role=tab]')]; return t.length === 4 && t[1].className.includes('bg-accent/10') && !t[3].className.includes('bg-accent/10') })
    await sleep(500) // let the 150ms tab transition settle before the screenshot
    await page.screenshot({ path: `${OUT}/v2-models-picker.png` })
    await page.keyboard.press('Escape'); await sleep(200)
    check('Escape dismisses the picker', (await panel.count()) === 0)

    // chat customization popover
    await page.getByRole('button', { name: 'Chat settings' }).click()
    await page.locator('[data-chat-settings]').waitFor()
    await page.locator('[data-chat-settings]').getByRole('radio', { name: 'Compact' }).click()
    await page.locator('[data-chat-settings]').getByRole('radio', { name: 'L', exact: true }).click()
    const prefs = await page.evaluate(() => ({ ls: localStorage.getItem('unq.chatprefs.v1'), fs: getComputedStyle(document.querySelector('[data-chat-messages]')).fontSize, cls: document.querySelector('[data-chat-messages]').className }))
    check('Chat Customization popover applies + persists density/font size', /compact/.test(prefs.ls ?? '') && /large/.test(prefs.ls ?? '') && prefs.fs === '15px' && /space-y-3/.test(prefs.cls), `${prefs.fs}`)
    const rows = await page.locator('[data-chat-settings]').getByText(/Auto-expand reasoning|Token & cost badges|Agent file activity|Auto-scroll streaming/).count()
    check('popover exposes all 6 customization controls', rows === 4 && (await page.locator('[data-chat-settings]').getByText('Message density').count()) === 1 && (await page.locator('[data-chat-settings]').getByText('Font size').count()) === 1)
    await page.keyboard.press('Escape'); await sleep(150)

    // mode switch Studio -> Code (Ctrl+E)
    await page.keyboard.press('Control+e')
    await page.getByText('Explorer').waitFor({ timeout: 15_000 })
    check('Cmd/Ctrl+E switches to Code Mode (explorer visible)', true)
    await page.getByText('Hero.tsx').first().click().catch(() => {})
    await page.locator('.cm-content').first().waitFor({ timeout: 15_000 })
    check('CodeMirror editor loads and shows source', (await page.locator('.cm-content').first().innerText()).length > 20)
    await page.screenshot({ path: `${OUT}/code.png` })
    await page.keyboard.press('Control+e')
    await page.getByPlaceholder(/Ask for a change/).waitFor({ timeout: 10_000 })
    check('switching back to Studio Mode shows the chat composer', true)

    const before = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    await page.getByRole('button', { name: 'Toggle theme' }).first().click()
    await sleep(400)
    check('light/dark theme toggles', before !== (await page.evaluate(() => document.documentElement.classList.contains('dark'))))

    await page.keyboard.press('Control+k')
    await page.getByPlaceholder(/Search files, actions/).waitFor()
    await page.keyboard.type('providers')
    check('command palette finds actions', await page.getByText('Manage providers & API keys').isVisible())
    await page.keyboard.press('Escape')

    // settings → providers: registry card, filter tabs, live /models fetch on key entry
    await page.getByRole('button', { name: 'Settings' }).first().click()
    for (const t of ['General', 'Providers', 'Connections', 'Prompts', 'Data', 'Debug', 'Features']) await page.getByRole('tab', { name: t }).waitFor({ timeout: 5000 })
    check('settings hub exposes all 7 tabs', true)
    await page.getByRole('tab', { name: 'Providers' }).click()
    await page.locator('[data-registry-card]').waitFor()
    check('Providers tab shows registry status + Refresh Registry button + last-synced', (await page.getByRole('button', { name: 'Refresh Registry' }).isVisible()) && /Last synced: (?!never)/.test(await page.locator('[data-registry-card]').innerText()))
    check('providers tab lists ≥20 browser-ready providers', (await page.getByRole('switch').count()) >= 20)
    await page.getByRole('tab', { name: /Requires Proxy/ }).click()
    check('server-IAM providers (AWS Bedrock) are tagged Requires Proxy 🔌', (await page.locator('button[aria-expanded]:has-text("Bedrock")').count()) > 0)
    await page.getByRole('tab', { name: /Local/ }).click()
    check('Local 💻 filter lists Ollama and LM Studio', (await page.locator('button[aria-expanded]:has-text("Ollama")').count()) > 0 && (await page.locator('button[aria-expanded]:has-text("LM Studio")').count()) > 0)
    await page.getByRole('tab', { name: /Browser-Ready/ }).click()
    await page.getByLabel('Search providers').fill('groq')
    await page.locator('button[aria-expanded]:has-text("Groq")').first().click()
    await page.getByPlaceholder('Paste your API key').fill('gsk_e2e_fake_key_123456')
    await page.locator('[data-models-block]').getByText('live · 2').waitFor({ timeout: 8000 })
    check('entering a key auto-fetches the LIVE /models endpoint (mocked) and shows a live badge', true)
    check('live-fetched model IDs populate the provider model list', (await page.locator('[data-models-block]').getByText('e2e-model-alpha').count()) > 0)
    await page.keyboard.press('Escape')
    await sleep(300)
    await page.locator('[data-model-pill]').first().click()
    await page.getByRole('tab', { name: 'Browser-Ready 🟢' }).click()
    await page.locator('[data-model-picker] input').fill('e2e-model')
    check('live models appear in the model picker', (await page.locator('[data-picker-list] button:has-text("e2e-model-alpha")').count()) > 0)
    await page.keyboard.press('Escape')

    await page.getByRole('tab', { name: 'Theme' }).click()
    await page.getByText('Theme Studio').waitFor()
    check('Theme Studio opens next to the preview', true)
  })

  // ── C. Tablet 768 ─────────────────────────────────────────────────────────
  await section('tablet', async () => {
    const t = await browser.newContext({ viewport: { width: 768, height: 1024 } })
    await wire(t)
    const tp = await t.newPage(); watch(tp, 'tablet')
    await tp.goto(URL, { waitUntil: 'networkidle' })
    await tp.getByRole('button', { name: 'Create project' }).click()
    await tp.waitForURL(/#\/p\//)
    await tp.getByPlaceholder(/Ask for a change/).waitFor({ timeout: 20_000 })
    await auditChat(tp, 'tablet 768×1024')
    await t.close()
  })

  // ── D. Mobile 375 ─────────────────────────────────────────────────────────
  await section('mobile', async () => {
    const m = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
    await wire(m)
    const mp = await m.newPage(); watch(mp, 'mobile')
    await mp.goto(URL, { waitUntil: 'networkidle' })
    check('mobile home has no horizontal overflow', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    await mp.screenshot({ path: `${OUT}/mobile-home.png` })
    await mp.getByRole('button', { name: 'Create project' }).click()
    await mp.waitForURL(/#\/p\//)
    await mp.getByPlaceholder(/Ask for a change/).waitFor({ timeout: 20_000 })
    check('mobile workspace has no horizontal overflow', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    const nav = await mp.locator('[data-mobile-nav] button').allInnerTexts()
    check('mobile bottom navigation shows Chat | Preview | Code', nav.join('|').replace(/\s+/g, '') === 'Chat|Preview|Code', nav.join('|'))
    const top = await mp.evaluate(() => {
      const h = document.querySelector('[data-topbar]'); const kids = [...h.children].filter((k) => k.offsetParent !== null).map((k) => k.getBoundingClientRect())
      const hit = (a, b) => a.right - b.left > 1 && b.right - a.left > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
      let bad = 0; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (hit(kids[i], kids[j])) bad++
      const title = h.querySelector('button.truncate'); return { bad, clipped: !!title && title.scrollWidth > title.clientWidth + 1 && title.clientWidth < 40, over: h.scrollWidth > h.clientWidth + 1 }
    })
    check('mobile top bar: project title does not collide with the controls', top.bad === 0 && !top.clipped && !top.over, JSON.stringify(top))
    await auditChat(mp, 'mobile 375×812')
    await mp.getByPlaceholder(/Ask for a change/).fill('y'.repeat(300))
    await auditChat(mp, 'mobile 375×812 (300-char unbroken input)')
    await mp.getByPlaceholder(/Ask for a change/).fill('')
    // bottom-sheet model picker
    await mp.locator('[data-model-pill]').first().click()
    const sheet = mp.locator('[data-dropdown-sheet]')
    await sheet.waitFor(); await sleep(600) // let the slide-in animation settle
    const box = async () => sheet.locator('> div').nth(1).boundingBox()
    let b = await box()
    check('model picker opens as a bottom sheet pinned to the bottom edge, inside the viewport', !!b && Math.abs(b.y + b.height - 812) <= 2 && b.x >= -1 && b.x + b.width <= 376, JSON.stringify(b))
    await mp.locator('[data-picker-list]').evaluate((el) => { el.scrollTop = 200 })
    await mp.mouse.move(180, 500); await mp.mouse.wheel(0, 300); await sleep(250)
    const b2 = await box()
    check('bottom sheet does not detach on scroll', !!b2 && Math.abs(b2.y - b.y) <= 1 && Math.abs(b2.height - b.height) <= 1)
    check('sheet has sticky search + provider filter pills', (await sheet.getByPlaceholder('Search models & providers…').isVisible()) && (await sheet.getByRole('tab').count()) === 4)
    await mp.screenshot({ path: `${OUT}/v2-mobile-picker.png` })
    await mp.locator('[data-dropdown-sheet] > div').first().click({ position: { x: 20, y: 20 } })
    await sheet.waitFor({ state: 'detached' })
    check('tapping the backdrop dismisses the sheet', true)
    await mp.screenshot({ path: `${OUT}/v2-mobile-chat.png` })
    await mp.locator('[data-mobile-nav] button', { hasText: 'Code' }).click()
    await mp.locator('.cm-content').first().waitFor({ timeout: 15_000 })
    check('mobile Code tab opens the editor', (await mp.locator('[data-mobile-nav] button[aria-current=page]').innerText()).trim() === 'Code')
    await mp.locator('[data-mobile-nav] button', { hasText: 'Preview' }).click()
    check('mobile Preview tab shows the live preview', await mp.locator('iframe[title="Live preview"]').first().isVisible())
    await m.close()
  })
} catch (e) {
  check('E2E run completed', false, String(e))
} finally {
  await browser.close()
  server.kill()
}

const noisy = errors.filter((e) => !/Failed to load resource|favicon/.test(e))
check('ZERO uncaught console/page errors', noisy.length === 0, noisy.slice(0, 4).join(' | '))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`)
process.exit(failed.length ? 1 : 0)
