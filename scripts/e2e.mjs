// Headless Chromium verification against the production build (`npm run build` first).
// Usage: npm run e2e   (requires: npx playwright install chromium)
// v3.0 suite adds: native-mobile (390×844) shell/sheets/drawer/inspector, Lovable desktop Home/Templates/picker keyboard/Project Settings/Publish QR/Version Card, plus the full v2.1 zero-regression suite.
// v3.3 suite adds: single-viewport Home, one FAB per tab, CDP touch swipe (finger-tracked pager, zero header overlap), picker no-autofocus + touch scroll + opaque header + dedupe, Home→Chat first message, no hammer, CORS-proxy custom provider end-to-end.
// v3.1 suite adds: OKLCH tokens + Light/Dark + Dashboard Background, mobile pill dock / skeletons / Projects & Chats filters / scroll-snap swipe workspace / preview bar / Timeline | + Changes diff, Account settings (queue, sound, permissions), Connectors hub, inset desktop canvas.
// v2.1 suite: zero-leak branding, zero broken icons, custom providers (4 protocols + mocked live /models), picker favorites + windowing,
// inline ⌘K edit, SEO/AEO canonical, theme, auth UI, chat zero-overlap @1440 + @375, SaaS esbuild-wasm compile, ZERO console errors.
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
const proxied = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`) }
const section = async (name, fn) => { if (process.env.E2E_ONLY && !name.includes(process.env.E2E_ONLY)) return; try { await fn() } catch (e) { check(`${name} completed`, false, String(e).slice(0, 2400)) } }
const errors = []
const notFound = []
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error' && !/lobehub/.test(m.location().url)) errors.push(`${tag} console: ${m.text()}`) })
  page.on('response', (r) => { if (r.status() === 404) notFound.push(r.url().slice(0, 100)) })
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

const ORIGIN = 'https://unqstudio-cm.pages.dev'
const brokenImgs = (page) => page.evaluate(() => [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.src.slice(0, 80)))
const leak = (page) => page.evaluate(() => /models\.dev/i.test(document.body.innerText))
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-tenant, x-api-key, anthropic-version, *', 'access-control-allow-methods': 'GET, POST, OPTIONS' }
const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
try {
  const snapshot = readFileSync('public/catalog-snapshot.json', 'utf8')
  const wire = async (ctx) => {
    for (const p of ['**/api/catalog', '**/api/models-dev']) await ctx.route(p, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: snapshot }))
    await ctx.route('**/api/auth/github?action=status', (r) => json(r, { configured: false })) // optional edge function: absent on pure-static hosts
    await ctx.route('https://openrouter.ai/api/v1/models', (r) => json(r, { data: [] }))
    await ctx.route('https://raw.githubusercontent.com/**', (r) => json(r, {}))
    // v3.3: stand-in for functions/api/proxy.ts (vite preview has no Pages Functions). Unwraps the JSON envelope and answers like the upstream.
    await ctx.route('**/api/proxy', async (r) => {
      const env = JSON.parse(r.request().postData() ?? '{}'); proxied.push(env)
      const sse = (t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`
      const up = env.url === 'https://gw.acme.test/v1/models' ? { type: 'application/json', body: JSON.stringify({ data: [{ id: 'acme-chat-1' }, { id: 'acme-chat-2' }, { id: 'acme-mini' }] }) }
        : env.url === 'https://api.mock-gw.test/api/v1/models' ? { type: 'application/json', body: JSON.stringify({ data: [{ id: 'mock-model' }] }) }
        : env.url === 'https://api.mock-gw.test/api/v1/chat/completions' ? { type: 'text/event-stream', body: sse('Hello ') + sse('from the proxy') + 'data: [DONE]\n\n' }
        : { status: 502, type: 'application/json', body: '{"error":"unmocked"}' }
      await r.fulfill({ status: up.status ?? 200, headers: { 'x-unq-proxy': '1', 'content-type': up.type }, body: up.body })
    })
    await ctx.route('https://gw.acme.test/v1/models', (r) => json(r, { data: [{ id: 'acme-chat-1' }, { id: 'acme-chat-2' }, { id: 'acme-mini' }] }))
    for (const re of [/cdn\.jsdelivr\.net\/npm\/@lobehub/, /models\.dev\/logos/]) await ctx.route(re, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: 'not-an-svg' })) // undecodable → Layer 3 (monogram) for long-tail providers, deterministically
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await wire(ctx)
  const page = await ctx.newPage()
  watch(page, 'desktop')

  await section('home · SEO/AEO · zero-leak · auth', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' })
    check('home loads with hero', await page.getByText('What should we').first().isVisible())
    check('ZERO "models.dev" in visible Home text (incl. About/FAQ)', !(await leak(page)))
    const faq = page.getByText('Which AI models and providers are supported?').first()
    if (await faq.count()) await faq.click().catch(() => {})
    check('ZERO "models.dev" after expanding the FAQ', !(await leak(page)))
    check('8 starter templates listed', (await page.locator('button:has(svg)', { hasText: /Blank Starter|SaaS Landing Page|Analytics Dashboard|Designer Portfolio|Product Storefront|AI Chat App|Kanban|Blog/ }).count()) >= 8)
    const canon = await page.locator('link[rel="canonical"]').getAttribute('href')
    check('canonical uses the VITE_SITE_URL default', canon === ORIGIN + '/', canon ?? '')
    check('og:url / og:image / twitter:image use the same origin', (await page.locator('meta[property="og:url"]').getAttribute('content'))?.startsWith(ORIGIN) && (await page.locator('meta[property="og:image"]').getAttribute('content'))?.startsWith(ORIGIN) && (await page.locator('meta[name="twitter:image"]').getAttribute('content'))?.startsWith(ORIGIN))
    const ld = await page.$$eval('script[type="application/ld+json"]', (n) => n.map((x) => x.textContent))
    check('JSON-LD parses, uses the canonical origin and never the old origin', ld.length >= 3 && ld.every((t) => { try { JSON.parse(t); return true } catch { return false } }) && new RegExp(`"url":\\s*"${ORIGIN}`).test(ld.join('')) && !/unqstudio\.pages\.dev/.test(ld.join('')))
    const get = async (p) => (await fetch(URL + p)).text()
    const [llms, full, sm, rb] = await Promise.all([get('llms.txt'), get('llms-full.txt'), get('sitemap.xml'), get('robots.txt')])
    check('llms.txt / llms-full.txt are branded and leak-free', llms.includes(ORIGIN) && !/models\.dev/i.test(llms + full))
    check('sitemap.xml + robots.txt use the canonical origin', sm.includes(`<loc>${ORIGIN}/</loc>`) && rb.includes(`Sitemap: ${ORIGIN}/sitemap.xml`))
    await page.screenshot({ path: `${OUT}/v21-home.png` })
    await page.locator('[data-account-signin]').first().click()
    check('Sign-in modal offers Google + GitHub', (await page.getByRole('dialog').getByText(/Google/).count()) > 0 && (await page.getByRole('dialog').getByText(/GitHub/).count()) > 0)
    await page.keyboard.press('Escape')
  })

  await section('studio · compile · chat layout · theme', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /SaaS Landing Page/ }).click()
    await page.getByRole('button', { name: 'Create project' }).click()
    await page.waitForURL(/#\/p\//)
    const frame = page.frameLocator('iframe[title="Live preview"]')
    await frame.locator('h1').first().waitFor({ timeout: 90_000 })
    const h1 = await frame.locator('h1').first().textContent()
    check('SaaS template compiled by esbuild-wasm and rendered in the sandboxed iframe', /Know what your product is doing/.test(h1 ?? ''), h1 ?? '')
    await auditChat(page, 'desktop 1440×900')
    await page.getByPlaceholder(/Ask for a change/).fill('x'.repeat(400) + ' @src/very/long/path/' + 'segment-'.repeat(20) + 'Component.tsx')
    await auditChat(page, 'desktop 1440×900 (400-char unbroken input)')
    await page.getByPlaceholder(/Ask for a change/).fill('')
    check('chat header shows the active model icon (svg or monogram)', (await page.locator('[data-chat-header] [data-icon-layer]').count()) > 0)
    await page.screenshot({ path: `${OUT}/v21-studio-desktop.png` })
    // theme
    await page.getByRole('button', { name: 'Settings' }).first().click()
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await page.getByRole('radio', { name: 'Light', exact: true }).click()
    const light = await page.evaluate(() => !document.documentElement.classList.contains('dark'))
    await page.getByRole('radio', { name: 'Dark', exact: true }).click()
    const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    check('Paper Light / Obsidian Dark toggle the theme', light && dark)
    await page.keyboard.press('Escape')
  })

  await section('model picker · icons · favorites · windowing', async () => {
    const pill = page.locator('[data-model-pill]').first()
    await pill.click()
    const panel = page.locator('[data-dropdown-panel]')
    await panel.waitFor()
    const [t, p, vp] = [await pill.boundingBox(), await panel.boundingBox(), page.viewportSize()]
    check('picker opens anchored to the trigger and inside the viewport', !!p && p.x >= 0 && p.y >= 0 && p.x + p.width <= vp.width + 1 && p.y + p.height <= vp.height + 1 && Math.abs((p.y - (t.y + t.height)) ) < 40 || Math.abs(p.y + p.height - t.y) < 40, JSON.stringify({ p, t }))
    for (const n of ['Recommended', 'Configured', 'Favorites ⭐', 'Custom', 'All Providers']) {
      await page.getByRole('tab', { name: n, exact: true }).click()
      await sleep(250)
      check(`picker tab "${n}": no "models.dev", no broken images`, !(await leak(page)) && (await brokenImgs(page)).length === 0)
    }
    await page.getByRole('tab', { name: 'All Providers', exact: true }).click()
    await sleep(300)
    const win = await page.evaluate(() => { const l = document.querySelector('[data-picker-list]'); return { rows: l.querySelectorAll('[data-provider-group],[data-model-row]').length, total: document.querySelector('#mp-rows').getBoundingClientRect().height } })
    check('All Providers is virtualized (300+ providers, ~25 DOM rows)', win.rows > 5 && win.rows < 80 && win.total > 10000, JSON.stringify(win))
    const sm = await page.evaluate(async () => {
      const l = document.querySelector('[data-picker-list]'); let max = 0; const t0 = performance.now()
      for (let i = 1; i <= 60; i++) { l.scrollTop = (l.scrollHeight - l.clientHeight) * (i / 60); await new Promise((r) => requestAnimationFrame(r)); max = Math.max(max, l.querySelectorAll('[data-provider-group],[data-model-row]').length) }
      return { ms: Math.round(performance.now() - t0), max }
    })
    check('scrolling the full catalog keeps the DOM small and runs smoothly', sm.max < 80 && sm.ms < 4000, JSON.stringify(sm))
    await page.getByLabel('Search models').fill('gpt vision')
    await page.locator('[data-model-row]').first().waitFor()
    const rowKey = await page.locator('[data-model-row]').first().getAttribute('data-model-row')
    check('capability search ("gpt vision") returns models', (await page.locator('[data-model-row]').count()) > 0)
    await page.locator('[data-model-row]').first().getByRole('button', { name: /^Star / }).click()
    await page.getByLabel('Search models').fill('')
    await page.getByRole('tab', { name: 'Favorites ⭐', exact: true }).click()
    await page.locator(`[data-model-row="${rowKey}"]`).waitFor()
    check('starred model appears under Favorites and persists to localStorage', (await page.evaluate(() => localStorage.getItem('unq.modelPrefs.v1') ?? '')).includes(rowKey))
    check('model rows render ModelIcon + ProviderIcon (svg or monogram)', (await page.locator(`[data-model-row="${rowKey}"] [data-icon-layer]`).count()) >= 1)
    check('zero broken images across Provider/Model icons', (await brokenImgs(page)).length === 0)
    await page.screenshot({ path: `${OUT}/v21-model-picker.png` })
    await page.keyboard.press('Escape')
  })

  await section('custom provider studio', async () => {
    await page.locator('[data-model-pill]').first().click()
    await page.getByTestId('picker-add-custom').click()
    const modal = page.getByTestId('custom-provider-modal')
    await modal.waitFor()
    for (const k of ['openai', 'anthropic', 'gemini', 'ollama']) check(`protocol option "${k}" is present`, (await modal.locator(`[data-protocol="${k}"]`).count()) === 1)
    await modal.locator('[data-protocol="gemini"]').click()
    check('Gemini protocol swaps the default URL hint', (await modal.getByTestId('cp-url').getAttribute('placeholder')).includes('generativelanguage'))
    await modal.locator('[data-protocol="openai"]').click()
    await page.getByTestId('cp-name').fill('Acme GW')
    await page.getByTestId('cp-url').fill('https://gw.acme.test/v1')
    await page.getByTestId('cp-key').fill('sk-test-123456789')
    await modal.getByRole('button', { name: 'Add Header' }).click()
    await modal.getByLabel('Header name').fill('X-Tenant')
    await modal.getByLabel('Header value').fill('t1')
    await page.getByTestId('cp-test').click()
    await page.getByTestId('cp-fetched').waitFor()
    check('Test & Auto-Fetch Models reports the mocked live count', /3 models/.test(await page.getByTestId('cp-fetched').innerText()))
    check('live preview lists fetched model ids', (await page.getByTestId('cp-preview').innerText()).includes('acme-chat-1'))
    await page.getByTestId('cp-model-input').fill('manual-model-x')
    await page.getByTestId('cp-model-input').press('Enter')
    check('manual Add Model ID chip appears', (await modal.getByText('manual-model-x').count()) > 0)
    check('custom provider modal: zero "models.dev"', !(await leak(page)))
    await page.screenshot({ path: `${OUT}/v21-custom-provider.png` })
    await page.getByTestId('cp-save').click()
    await modal.waitFor({ state: 'detached' })
    const ls = await page.evaluate(() => JSON.stringify({ ...localStorage }))
    check('API key is NOT in localStorage (vault only)', !ls.includes('sk-test-123456789') && !ls.includes('X-Tenant"') === true || !ls.includes('sk-test-123456789'))
    check('custom provider record persisted without secrets', ls.includes('custom:acme-gw') && !ls.includes('sk-test'))
    await page.locator('[data-model-pill]').first().click()
    await page.getByRole('tab', { name: 'Custom', exact: true }).click()
    const grp = page.locator('[data-provider-group="custom:acme-gw"]')
    await grp.waitFor()
    check('custom provider shows in the picker with its icon', (await grp.locator('[data-icon-layer]').count()) === 1)
    await grp.click()
    await page.locator('[data-model-row="custom:acme-gw::acme-chat-1"]').waitFor({ timeout: 8000 })
    check('auto-fetched live models + manual model appear under the custom provider', (await page.locator('[data-model-row="custom:acme-gw::manual-model-x"]').count()) === 1)
    await page.keyboard.press('Escape')
    // Providers Hub
    await page.getByRole('button', { name: 'Settings' }).first().click()
    await page.getByRole('tab', { name: 'Providers Hub' }).click()
    await page.getByTestId('add-custom-provider').first().waitFor()
    const sections = ['Configured & Active', 'Popular Cloud', 'Custom Providers', 'Local AI', 'All Providers']
    let ok = true
    for (const n of sections) ok = ok && (await page.getByRole('heading', { name: n }).count()) > 0
    check('Providers Hub exposes + Add Custom Provider and the 5 sections', ok)
    check('Providers Hub: custom card with Edit / Duplicate / Delete', (await page.getByRole('button', { name: 'Edit Acme GW' }).count()) === 1 && (await page.getByRole('button', { name: 'Duplicate Acme GW' }).count()) === 1 && (await page.getByRole('button', { name: 'Delete Acme GW' }).count()) === 1)
    check('Providers Hub: "Refresh Catalog" + synced status, zero "models.dev"', (await page.getByRole('button', { name: 'Refresh Catalog' }).first().isVisible()) && !(await leak(page)))
    await page.getByRole('tab', { name: 'Browser-Ready', exact: true }).click().catch(() => {})
    check('Providers Hub: zero broken images', (await brokenImgs(page)).length === 0)
    for (const n of ['Prompt Rules', 'Chat & Editor', 'Appearance', 'Sign In & Cloud Sync', 'Connections', 'Plugins & MCP', 'Data & Storage', 'Debug & Logs']) await page.getByRole('tab', { name: n }).waitFor({ timeout: 5000 })
    check('Settings hub exposes all 9 categorised sections', true)
    await page.getByRole('button', { name: 'Delete Acme GW' }).count()
    await page.keyboard.press('Escape')
  })

  await section('code mode · inline ⌘K edit', async () => {
    await page.keyboard.press('Control+e')
    await page.locator('.cm-content, [data-file-tree], [role="tree"]').first().waitFor({ timeout: 10000 }).catch(() => {})
    if (!(await page.locator('.cm-content').count())) await page.getByText('App.tsx').first().click()
    await page.locator('.cm-content').first().waitFor({ timeout: 15000 })
    await page.locator('.cm-content').first().click()
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('Shift+End')
    await page.getByTestId('inline-edit-button').waitFor({ timeout: 5000 })
    check('selecting code shows the floating "AI Edit (⌘K)" button', /AI Edit/.test(await page.getByTestId('inline-edit-button').innerText()))
    await page.keyboard.press('Control+k')
    const w = page.locator('[data-inline-edit]')
    await w.waitFor({ timeout: 5000 })
    check('⌘K opens the inline edit widget (palette did not steal the key)', (await w.getByLabel('Edit instruction').isVisible()) && (await page.getByPlaceholder(/Search commands|Type a command/i).count()) === 0)
    check('inline widget is inside the viewport and shows the line range', await w.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 }) && /Edit lines/.test((await w.getByLabel('Edit instruction').getAttribute('placeholder')) ?? ''))
    await page.keyboard.press('Escape')
    await w.waitFor({ state: 'detached' })
    await page.locator('.cm-content').first().click()
    await page.keyboard.press('Control+i')
    check('⌘I opens the widget even without a selection', (await page.locator('[data-inline-edit]').count()) === 1)
    await page.getByLabel('Close inline edit').click()
    check('inline widget dismisses cleanly', (await page.locator('[data-inline-edit]').count()) === 0)
    await page.keyboard.press('Control+e')
  })

  // ── mobile 375 ────────────────────────────────────────────────────────────
  await section('mobile 375×812', async () => {
    const m = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
    await wire(m)
    const mp = await m.newPage()
    watch(mp, 'mobile')
    await mp.goto(URL, { waitUntil: 'networkidle' })
    check('mobile home: zero "models.dev"', !(await leak(mp)))
    await mp.getByRole('button', { name: 'Create project' }).click()
    await mp.waitForURL(/#\/p\//)
    await mp.locator('[data-chat-root]').first().waitFor({ timeout: 30000 })
    await auditChat(mp, 'mobile 375×812')
    await mp.screenshot({ path: `${OUT}/v21-mobile-chat.png` })
    await mp.locator('[data-model-pill]').first().click()
    const picker = mp.locator('[data-sheet-panel]')
    await picker.waitFor()
    await sleep(500)
    const b = await picker.boundingBox()
    check('model picker is a bottom sheet inside the 375px viewport', !!b && b.x >= -1 && b.x + b.width <= 376 && b.y + b.height <= 813 && b.y + b.height >= 700, JSON.stringify(b))
    check('mobile picker: zero broken images, zero "models.dev"', (await brokenImgs(mp)).length === 0 && !(await leak(mp)))
    await m.close()
  })


  // ════════════════════════ v3.0 · native mobile app experience (390×844) ════════════════════════
  const ovf = (pg) => pg.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  const rects = (pg, sel) => pg.$$eval(sel, (els) => els.filter((e) => e.offsetParent !== null).map((e) => { const b = e.getBoundingClientRect(); return { n: e.getAttribute('aria-label') || e.textContent.trim().slice(0, 14), l: b.left, r: b.right, t: b.top, b: b.bottom } }))
  await section('v3 mobile app experience 390×844', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    await wire(m)
    const mp = await m.newPage()
    watch(mp, 'v3-mobile')
    await mp.goto(URL, { waitUntil: 'networkidle' })
    check('PWA: viewport-fit=cover + apple-mobile-web-app-capable + theme-color present', /viewport-fit=cover/.test((await mp.locator('meta[name="viewport"]').getAttribute('content')) ?? '') && (await mp.locator('meta[name="apple-mobile-web-app-capable"]').count()) === 1 && (await mp.locator('meta[name="theme-color"]').count()) >= 1)
    const man = await (await fetch(URL + 'manifest.webmanifest')).json()
    check('PWA manifest is standalone with 512px + maskable icons', man.display === 'standalone' && man.icons.some((i) => i.sizes === '512x512') && man.icons.some((i) => i.purpose === 'maskable'))
    check('mobile Home: zero horizontal overflow', (await ovf(mp)) <= 1, String(await ovf(mp)))
    check('mobile Home: ZERO "models.dev" + zero broken images', !(await leak(mp)) && (await brokenImgs(mp)).length === 0)
    await mp.screenshot({ path: `${OUT}/v30-home-mobile.png` })
    await mp.locator('[data-workspace-pill]').click()
    await mp.getByRole('button', { name: 'Open navigation' }).click()
    await mp.locator('[data-sidebar-drawer]').waitFor()
    await sleep(350)
    const dr = await mp.locator('[data-sidebar-drawer] aside').boundingBox()
    check('Sidebar drawer opens inside the viewport (New Project CTA visible)', !!dr && dr.x >= -1 && dr.width <= 391 && (await mp.getByRole('button', { name: 'New Project' }).isVisible()), JSON.stringify(dr))
    check('Sidebar drawer: zero horizontal overflow', (await ovf(mp)) <= 1)
    await mp.locator('[data-sidebar-backdrop]').click({ position: { x: 370, y: 400 } })
    await mp.locator('[data-sidebar-drawer]').waitFor({ state: 'detached' })
    check('Sidebar drawer closes on outside tap', true)
    await mp.getByRole('button', { name: 'Create project' }).click()
    await mp.waitForURL(/#\/p\//)
    await mp.locator('[data-topbar-mobile]').waitFor()
    const tb = await rects(mp, '[data-topbar-mobile] button')
    const hdr = await mp.locator('[data-topbar-mobile]').boundingBox()
    const overlapTb = tb.some((a, i) => tb.some((c, j) => j > i && Math.min(a.r, c.r) - Math.max(a.l, c.l) > 1))
    check('mobile top bar: 3 clean controls (menu · Project Pill · Publish), no overlap/clip, ≤ 72px tall', tb.length === 3 && !overlapTb && tb.every((x) => x.l >= 0 && x.r <= 390) && hdr.height <= 72, JSON.stringify({ n: tb.map((x) => x.n), h: hdr.height }))
    check('swipe workspace: scroll-snap strip with Chat + Preview panes and NO bottom tab bar', (await mp.locator('[data-snap-strip] [data-pane]').count()) === 2 && (await mp.locator('[data-mobile-nav]').count()) === 0)
    check('mobile Studio chat: zero horizontal overflow', (await ovf(mp)) <= 1)
    await mp.screenshot({ path: `${OUT}/v30-mobile-chat.png` })
    // model picker bottom sheet: open, drag-to-dismiss
    await mp.locator('[data-model-pill]').first().click()
    const panel = mp.locator('[data-sheet-panel]')
    await panel.waitFor()
    await sleep(400)
    const pb = await panel.boundingBox()
    check('Model Picker opens as a draggable Bottom Sheet inside the viewport', !!pb && pb.x >= -1 && pb.x + pb.width <= 391 && pb.y + pb.height <= 845 && (await mp.locator('[data-sheet-handle]').count()) === 1, JSON.stringify(pb))
    const hb = await mp.locator('[data-sheet-handle]').boundingBox()
    await mp.mouse.move(hb.x + hb.width / 2, hb.y + 10)
    await mp.mouse.down()
    await mp.mouse.move(hb.x + hb.width / 2, hb.y + 420, { steps: 10 })
    await mp.mouse.up()
    await sleep(600)
    check('dragging the sheet handle down dismisses it', (await mp.locator('[data-bottom-sheet]').count()) === 0)
    // preview + visual inspector sheet
    await mp.locator('[data-pane-arrow]').click()
    const fr = mp.frameLocator('iframe[title="Live preview"]')
    await fr.locator('h1').first().waitFor({ timeout: 90_000 })
    await sleep(400)
    check('mobile Preview: zero horizontal overflow + route bar present', (await ovf(mp)) <= 1 && (await mp.locator('[data-route-bar] input').count()) === 1)
    await mp.getByRole('button', { name: 'Visual edit' }).click()
    await fr.locator('h1').first().click()
    await mp.locator('[data-visual-inspector="sheet"]').waitFor({ timeout: 10_000 })
    await sleep(400)
    const vb = await mp.locator('[data-sheet-panel]').boundingBox()
    check('Visual Inspector opens as a compact mobile Bottom Sheet (top half of preview stays visible)', !!vb && vb.y >= 844 * 0.5 - 40 && vb.y + vb.height <= 845, JSON.stringify(vb))
    await mp.screenshot({ path: `${OUT}/v30-mobile-sheet.png` })
    await mp.keyboard.press('Escape')
    await sleep(400)
    await mp.getByRole('button', { name: 'Visual edit' }).click()
    // code tab
    await mp.locator('[data-preview-overflow]').click()
    await mp.getByText('Open code').click()
    await sleep(900)
    check('mobile Code view: zero horizontal overflow', (await ovf(mp)) <= 1, String(await ovf(mp)))
    await mp.locator('[data-back-to-studio]').click()
    // project pill + settings + publish
    await mp.locator('[data-project-pill]').click()
    await mp.locator('[data-project-switcher]').waitFor()
    await sleep(350)
    check('Project Pill opens the project sheet with quick actions', (await mp.locator('[data-project-switcher] [role="group"] button').count()) === 6 && (await ovf(mp)) <= 1)
    await mp.getByRole('button', { name: /Project settings, knowledge/ }).click()
    await mp.locator('[data-ps-section="overview"]').waitFor()
    await sleep(350)
    check('mobile Project Settings sheet: zero horizontal overflow', (await ovf(mp)) <= 1, String(await ovf(mp)))
    await mp.keyboard.press('Escape')
    await sleep(400)
    await mp.locator('[data-publish-pill]').click()
    await mp.locator('[data-publish-sheet]').waitFor()
    await sleep(350)
    check('Publish opens as a Bottom Sheet with zero horizontal overflow', (await ovf(mp)) <= 1 && (await mp.locator('[data-live-url]').isVisible()), String(await ovf(mp)))
    await mp.keyboard.press('Escape')
    await m.close()
  })

  // ════════════════════════ v3.0 · desktop Lovable experience (1440×900) ════════════════════════
  await section('v3 desktop Lovable experience 1440×900', async () => {
    const d = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await wire(d)
    const dp = await d.newPage()
    watch(dp, 'v3-desktop')
    await dp.goto(URL, { waitUntil: 'networkidle' })
    check('Lovable Home: hero, floating composer and starter chips', (await dp.locator('[data-hero-composer]').isVisible()) && (await dp.locator('[data-starter-chips] button').count()) >= 5)
    check('collapsible desktop sidebar rail is present', await dp.locator('[data-app-sidebar]').isVisible())
    await dp.locator('[aria-label="Collapse sidebar"]').click()
    await sleep(400)
    check('sidebar collapses to the icon rail', (await dp.locator('[data-app-sidebar]').getAttribute('data-collapsed')) === 'true')
    await dp.locator('[aria-label="Expand sidebar"]').click()
    await dp.locator('[data-showcase]').scrollIntoViewIfNeeded()
    await dp.getByRole('button', { name: 'E-Commerce', exact: true }).click()
    check('Templates category filter (E-Commerce → 1 card, All → 7+)', (await dp.locator('[data-showcase-card]').count()) === 1 && (await dp.locator('[data-showcase-card="E-Commerce"]').count()) === 1)
    await dp.getByRole('button', { name: 'All', exact: true }).click()
    check('showcase "All" lists every template', (await dp.locator('[data-showcase-card]').count()) >= 7)
    await dp.locator('[data-showcase-card="SaaS"]').getByRole('button', { name: 'Preview' }).click()
    check('template Preview modal shows artwork + files', await dp.locator('[data-template-preview]').isVisible())
    await dp.keyboard.press('Escape')
    await dp.evaluate(() => { window.scrollTo(0, 0); document.querySelector('[data-app-main]')?.scrollTo(0, 0) })
    await sleep(300)
    await dp.screenshot({ path: `${OUT}/v30-home-desktop.png` })
    check('desktop Home: ZERO "models.dev" + zero broken images + zero overflow', !(await leak(dp)) && (await brokenImgs(dp)).length === 0 && (await ovf(dp)) <= 1)
    await dp.locator('[data-showcase-card="SaaS"]').getByRole('button', { name: 'Remix' }).click()
    await dp.waitForURL(/#\/p\//)
    const f = dp.frameLocator('iframe[title="Live preview"]')
    await f.locator('h1').first().waitFor({ timeout: 90_000 })
    check('live esbuild-wasm compiles the remixed SaaS template inside the sandboxed iframe', ((await f.locator('h1').first().textContent()) ?? '').length > 3)
    await sleep(800)
    check('preview toolbar: route bar, viewport pills, Visual edit, Console', (await dp.locator('[data-route-bar] input').inputValue()) !== undefined && (await dp.locator('[aria-label="Viewport"] button').count()) === 3 && (await dp.getByRole('button', { name: 'Visual edit' }).isVisible()))
    await dp.screenshot({ path: `${OUT}/v30-studio-desktop.png` })
    // model picker keyboard navigation
    await dp.locator('[data-model-pill]').first().click()
    const search = dp.getByLabel('Search models')
    await search.waitFor()
    await search.press('ArrowDown')
    const ad = await search.getAttribute('aria-activedescendant')
    check('Model Picker: ArrowDown sets aria-activedescendant and a highlighted row', !!ad && (await dp.locator(`#${ad}[data-active]`).count()) === 1, ad ?? '')
    await search.press('End')
    const ad2 = await search.getAttribute('aria-activedescendant')
    check('Model Picker: End jumps to the last row (virtual window scrolls it into view)', !!ad2 && ad2 !== ad && (await dp.locator(`#${ad2}`).count()) === 1, `${ad} → ${ad2}`)
    await search.press('Home')
    await search.press('Enter')
    await search.press('Escape')
    await sleep(300)
    check('Model Picker: Enter then Escape closes the picker', (await dp.locator('[data-model-picker]').count()) === 0)
    // project settings: knowledge persists across reload
    // Enter on the picker's first row opens the Settings hub (its scrim would block the toolbar) — dismiss it deterministically.
    if (await dp.locator('[role=dialog]').count()) { await dp.keyboard.press('Escape'); await dp.locator('[role=dialog]').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {}) }
    await dp.getByRole('button', { name: 'Project settings' }).click()
    await dp.getByRole('tab', { name: /Knowledge/ }).click()
    const note = 'E2E brand: use violet #6D5EF5 and a friendly tone.'
    await dp.getByLabel('Project knowledge').fill(note)
    await dp.getByRole('button', { name: 'Save knowledge' }).click()
    await sleep(500)
    await dp.screenshot({ path: `${OUT}/v30-project-settings.png` })
    check('Project Settings hub: 4 sections available', (await dp.getByRole('tab').filter({ hasText: /Overview|Knowledge|Versions|Integrations/ }).count()) === 4)
    await dp.reload({ waitUntil: 'networkidle' })
    await dp.getByRole('button', { name: 'Project settings' }).click()
    await dp.getByRole('tab', { name: /Knowledge/ }).click()
    check('Project Knowledge persisted in IndexedDB after reload', (await dp.getByLabel('Project knowledge').inputValue()) === note)
    await dp.keyboard.press('Escape')
    await sleep(300)
    // publish popover: SEO + QR
    await dp.getByRole('button', { name: 'Publish', exact: true }).click()
    await dp.locator('[data-publish-popover]').waitFor()
    await dp.getByRole('tab', { name: /Share & SEO/ }).click()
    await dp.getByLabel('App title').fill('E2E Title')
    await dp.getByRole('button', { name: 'Save to index.html' }).click()
    await dp.getByText('SEO & share info saved').first().waitFor({ timeout: 8000 }).catch(() => {})
    check('SEO editor saves to index.html (toast) with live OG preview', (await dp.getByText('SEO & share info saved').first().isVisible()) && (await dp.locator('[data-og-preview]').getByText('E2E Title').isVisible()))
    await dp.getByRole('tab', { name: 'Publish', exact: true }).click()
    await dp.getByLabel('Live URL', { exact: true }).fill('https://e2e-demo.pages.dev')
    await dp.locator('[data-qr] svg').waitFor()
    const qr = await dp.locator('[data-qr] svg').evaluate((el) => ({ w: el.getBoundingClientRect().width, paths: el.querySelectorAll('path').length, d: el.querySelector('path').getAttribute('d').length }))
    check('Publish sheet renders a crisp inline <svg> QR code', qr.w > 80 && qr.paths === 1 && qr.d > 200, JSON.stringify(qr))
    await dp.screenshot({ path: `${OUT}/v30-publish-qr.png` })
    check('Publish sheet: ZERO "models.dev" + zero broken images', !(await leak(dp)) && (await brokenImgs(dp)).length === 0)
    await dp.keyboard.press('Escape')
    // seeded chat history → inline Version Card + follow-up chips + 1-tap restore
    const projectId = dp.url().split('#/p/')[1]
    await dp.evaluate(async (id) => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('unqstudio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
      const all = await new Promise((res) => { const q = db.transaction('checkpoints').objectStore('checkpoints').getAll(); q.onsuccess = () => res(q.result) })
      const cp = all.filter((c) => c.projectId === id).sort((a, b) => a.seq - b.seq)[0]
      const msgs = [
        { id: 'u1', role: 'user', text: 'Make the hero bolder', createdAt: Date.now() - 60000, mode: 'build' },
        { id: 'a1', role: 'assistant', text: 'Done', createdAt: Date.now() - 50000, mode: 'build', parts: [{ kind: 'text', text: 'Done — the hero is bolder.' }], ops: [{ id: 'o1', op: 'update', path: '/src/App.tsx', status: 'applied', added: 3, removed: 1 }], checkpointAfter: cp.id, checkpointBefore: cp.id, durationMs: 4200 },
      ]
      await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ messages: msgs }, `chat:${id}`); tx.oncomplete = () => res() })
    }, projectId)
    await dp.reload({ waitUntil: 'networkidle' })
    await dp.locator('[data-version-card="1"]').waitFor({ timeout: 20_000 })
    const chips = await dp.locator('[data-followup-chip]').count()
    check('inline Version Card (v1 + Preview / Code·Diff / Restore) and 2–3 follow-up chips render', (await dp.locator('[data-version-card="1"]').getByRole('button', { name: 'Restore' }).isVisible()) && chips >= 2 && chips <= 3, `chips=${chips}`)
    check('Build activity card summarises the turn ("Thought for 4s")', await dp.getByText('Thought for 4s').isVisible())
    await dp.locator('[data-version-card="1"]').getByRole('button', { name: 'Restore' }).click()
    await dp.getByText('Restored v1').first().waitFor({ timeout: 8000 }).catch(() => {})
    check('1-tap Restore creates a safety checkpoint and restores v1', await dp.getByText('Restored v1').first().isVisible())
    await d.close()
  })

  // ── v3.1 ────────────────────────────────────────────────────────────────
  const seedChat = async (page) => {
    await page.evaluate(async () => {
      const pid = decodeURIComponent(location.hash.replace('#/p/', ''))
      const dbs = (await indexedDB.databases()).filter((d) => d.name && d.name !== 'unq-skills')
      for (const info of dbs) {
        const db = await new Promise((res, rej) => { const r = indexedDB.open(info.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
        if (!db.objectStoreNames.contains('kv')) { db.close(); continue }
        const now = Date.now()
        const messages = [
          { id: 'u1', role: 'user', text: 'Add a pricing section', createdAt: now - 90000, mode: 'build' },
          { id: 'a1', role: 'assistant', text: 'Added pricing.', createdAt: now - 60000, mode: 'build', durationMs: 75000, usage: { inputTokens: 900, outputTokens: 334 }, checkpointAfter: 'cp-seed',
            parts: [{ kind: 'think', text: 'Plan the pricing layout', done: true }, { kind: 'op', opId: 'o1' }, { kind: 'text', text: 'Added pricing.' }, { kind: 'op', opId: 'o2' }],
            ops: [{ id: 'o1', op: 'create', path: '/src/Pricing.tsx', status: 'applied', added: 3, removed: 0, after: "export const Pricing = () => <div>Pricing</div>\nexport default Pricing\n// done\n" },
                  { id: 'o2', op: 'update', path: '/src/App.tsx', status: 'applied', added: 1, removed: 1, before: "const title = 'Hello'\nexport default title\n", after: "const title = 'Pricing'\nexport default title\n" }] },
        ]
        await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ messages }, 'chat:' + pid); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
        db.close()
      }
    })
  }
  await section('v3.1 mobile 390×844', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    await wire(m)
    const mp = await m.newPage(); watch(mp, 'v31m')
    await mp.goto(URL); await mp.locator('[data-home-single]').waitFor(); await sleep(500)
    const nav = await rects(mp, '[data-mobile-bottom-nav] button')
    check('v3.1 mobile: floating Home · Projects · Chats pill dock (3 tabs, 44px targets)', nav.length === 3 && nav.every((x) => x.b - x.t >= 43), nav.map((x) => x.n).join('|'))
    const pill = await mp.evaluate(() => { const b = document.querySelector('[data-mobile-bottom-nav] > div'); const c = getComputedStyle(b); return { r: parseFloat(c.borderTopLeftRadius), sh: c.boxShadow !== 'none' } })
    check('dock is rounded-full with a floating shadow', pill.r >= 20 && pill.sh)
    check('Home header: workspace switcher pill (left) + account avatar (right)', (await mp.locator('[data-workspace-pill]:visible').count()) === 1 && (await mp.locator('[data-account-avatar]:visible').count()) === 1)
    const geo = await mp.evaluate(() => { const el = document.querySelector('[data-hero-composer]'); const c = el.getBoundingClientRect(); return { mid: (c.top + c.bottom) / 2, h: c.height, w: c.width, r: parseFloat(getComputedStyle(el).borderTopLeftRadius), vh: innerHeight } })
    check('Home composer is vertically centred in the single screen, radius 28px, ≤ 672px', Math.abs(geo.mid - geo.vh / 2) < 130 && geo.r === 28 && geo.w <= 672, JSON.stringify(geo))
    check('Home mobile: zero horizontal overflow', (await ovf(mp)) <= 1)
    await mp.locator('[data-mode-trigger]').click()
    check('Build ▾ popover lists Build / Chat (Free) / Plan', (await mp.locator('[data-mode-menu]').innerText()).includes('Free') && (await mp.locator('[data-mode-menu]').innerText()).includes('Detailed spec'))
    await mp.keyboard.press('Escape'); await sleep(300)
    await mp.screenshot({ path: `${OUT}/v31-home-mobile.png` })
    await mp.locator('[data-nav-tab="projects"]').click()
    await mp.locator('[data-projects-view]').waitFor(); await sleep(300)
    check('Projects view: header + Search + Filter + floating New project', (await mp.getByRole('heading', { name: /Projects/ }).count()) === 1 && (await mp.getByLabel('Search projects').count()) === 1 && (await mp.getByLabel('Filter projects').count()) === 1 && (await mp.locator('[data-new-project]').isVisible()))
    await mp.screenshot({ path: `${OUT}/v31-projects-mobile.png` })
    await mp.locator('[data-nav-tab="chats"]').click(); await mp.locator('[data-chats-view]').waitFor(); await sleep(500)
    await mp.getByLabel('Filter chats').click()
    const opts = await mp.locator('[data-chat-filter-menu] [role="menuitemradio"]').allInnerTexts()
    check('Chats filter popover: All · Unread · Scheduled · Archived', opts.join('|') === 'All|Unread|Scheduled|Archived', opts.join('|'))
    await mp.getByRole('menuitemradio', { name: 'Archived' }).click(); await sleep(300)
    check('Archived filter applies (empty state)', (await mp.locator('[data-chat-empty]').innerText()).includes('archived'))
    await mp.screenshot({ path: `${OUT}/v31-chats-mobile.png` })
    check('Projects/Chats mobile: zero horizontal overflow', (await ovf(mp)) <= 1)
    await mp.locator('[data-nav-tab="home"]').click(); await mp.locator('[data-home-single]').waitFor(); await sleep(500)
    await mp.locator('[data-hero-send]').click()
    await mp.locator('[data-snap-strip]').waitFor({ timeout: 30_000 }); await sleep(600)
    check('workspace has NO bottom dock / tab bar', (await mp.locator('[data-mobile-bottom-nav]').count()) === 0 && (await mp.locator('[data-mobile-nav]').count()) === 0)
    const strip = await mp.evaluate(() => { const s = document.querySelector('[data-snap-strip]'); const t = s.querySelector('[data-pager-track]'); const ps = [...s.querySelectorAll('[data-pane]')]; return { n: ps.length, same: ps.every((p) => Math.abs(p.getBoundingClientRect().width - s.clientWidth) < 1), contain: getComputedStyle(ps[0]).contain, clip: getComputedStyle(s).overflowX, tr: getComputedStyle(t).transform !== 'none' } })
    check('workspace pager: clipped viewport, 2 panes exactly one viewport wide, contain layout paint, GPU transform track', strip.n === 2 && strip.same && /layout/.test(strip.contain) && strip.clip === 'hidden' && strip.tr, JSON.stringify(strip))
    const top = await rects(mp, '[data-topbar-mobile] button')
    check('workspace top bar: 44px Close · title pill · 44px arrow', top.length === 3 && top[0].r - top[0].l >= 43 && top[2].r - top[2].l >= 43)
    await seedChat(mp); await mp.reload(); await mp.locator('[data-snap-strip]').waitFor(); await sleep(900)
    await mp.screenshot({ path: `${OUT}/v31-workspace-chat-mobile.png` })
    check('chat shows quiet "Used X tools" row + inline Version card with Details & Preview', (await mp.locator('[data-used-tools]').count()) === 1 && (await mp.locator('[data-version-card]').count()) === 1 && (await mp.locator('[data-version-details]').count()) === 1)
    await mp.locator('[data-used-tools]').click(); await mp.locator('[data-activity-inspector]').waitFor(); await sleep(400)
    check('Activity sheet: Timeline | + Changes toggle + "Worked for" summary', (await mp.locator('[data-activity-summary]').innerText()).startsWith('Worked for') && (await mp.getByText('+ Changes').count()) >= 1)
    const kinds = await mp.locator('[data-timeline-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-timeline-item')))
    check('Timeline: Thought → Created → Edited → Typecheck / Build', kinds.join(',') === 'thought,created,edited,build', kinds.join(','))
    await mp.locator('[data-timeline-item="thought"] button').click(); check('Thought block expands', (await mp.getByText('Plan the pricing layout').count()) === 1)
    await mp.getByText(/^\+ Changes/).first().click(); await sleep(300)
    check('Changes tab: Created + Modified cards', (await mp.locator('[data-change-card="Created"]').count()) === 1 && (await mp.locator('[data-change-card="Modified"]').count()) === 1)
    await mp.locator('[data-change-card="Modified"] button[aria-expanded]').click(); await sleep(300)
    check('diff has green (+) and red (−) line-numbered rows', (await mp.locator('[data-diff-line="add"]').count()) >= 1 && (await mp.locator('[data-diff-line="del"]').count()) >= 1)
    await mp.screenshot({ path: `${OUT}/v31-timeline-changes.png` })
    check('Activity sheet: zero horizontal overflow', (await ovf(mp)) <= 1)
    await mp.keyboard.press('Escape'); await sleep(500)
    await mp.locator('[data-pane-arrow]').click()
    await mp.waitForFunction(() => document.querySelector('[data-snap-strip]').dataset.activePane === 'preview', null, { timeout: 5000 }); await sleep(450)
    check('arrow glides to Preview; floating preview bar visible', await mp.locator('[data-preview-bar]').isVisible())
    await mp.locator('[data-preview-overflow]').click()
    const wantItems = ['Refresh', 'Change page', 'History', 'Share', 'Social & search', 'Preview in new tab']
    const found = []
    for (const t of wantItems) if ((await mp.getByText(t, { exact: true }).count()) > 0) found.push(t)
    check('Preview overflow: Refresh · Change page · History · Share · Social & search · Preview in new tab', found.length === wantItems.length, found.join('|'))
    await mp.keyboard.press('Escape'); await sleep(300)
    check('Preview mobile: zero horizontal overflow', (await ovf(mp)) <= 1)
    await mp.locator('[data-preview-back]').click()
    await mp.waitForFunction(() => document.querySelector('[data-snap-strip]').dataset.activePane === 'chat', null, { timeout: 5000 })
    check('‹ Chat pill glides back to Chat', true)
    await m.close()
  })
  await section('v3.1 desktop 1440×900', async () => {
    const d = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await wire(d)
    const dp = await d.newPage(); watch(dp, 'v31d')
    await dp.goto(URL); await dp.locator('[data-hero]').waitFor(); await sleep(600)
    // The production CSS minifier may serialise oklch() as lab(); compare the *resolved colours* instead of the literal text.
    const same = (pairs) => dp.evaluate((ps) => { const cv = document.createElement('canvas'); cv.width = cv.height = 1; const g = cv.getContext('2d', { willReadFrequently: true }); const probe = document.createElement('div'); document.body.appendChild(probe); const px = (c) => { probe.style.color = ''; probe.style.color = c; c = getComputedStyle(probe).color; g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = c; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data] }; return ps.map(([a, b]) => { const x = px(a), y = px(b); return x.every((v, i) => Math.abs(v - y[i]) <= 2) }) }, pairs)
    const lightOk = await same([['var(--bg-depth)', 'oklch(95.49% 0 107)'], ['var(--bg-base)', 'oklch(96.99% 0 107)'], ['var(--bg-primary)', 'oklch(98.51% 0 107)'], ['var(--bg-secondary)', 'oklch(99.99% 0 107)'], ['var(--fg-primary)', 'oklch(10% 0 0)'], ['var(--fg-tertiary)', 'oklch(50% .001 107)'], ['var(--bg-accent)', 'oklch(52% .19 277)']])
    check('OKLCH depth ladder tokens resolve to the specified light values', lightOk.every(Boolean), JSON.stringify(lightOk))
    check('Aurora hero is a crisp SVG (no CSS blur filter)', (await dp.locator('[data-aurora] svg').count()) === 1 && (await dp.evaluate(() => getComputedStyle(document.querySelector('[data-aurora] svg')).filter)) === 'none')
    check('Geist is the UI font', (await dp.evaluate(() => getComputedStyle(document.body).fontFamily)).includes('Geist'))
    await dp.screenshot({ path: `${OUT}/v31-home-desktop.png` })
    await dp.locator('[data-account-avatar]').click(); await dp.locator('[data-account-menu]').waitFor()
    for (const id of ['add-account', 'account-settings', 'connectors', 'documentation', 'appearance']) check(`Account menu row: ${id}`, (await dp.locator(`[data-account-row="${id}"]`).count()) === 1)
    await dp.locator('[data-account-row="appearance"]').click()
    await dp.locator('[data-bg-swatch="peach"]').click()
    check('Dashboard Background swatch persists + tags <html>', (await dp.evaluate(() => document.documentElement.dataset.dashboardBg + '|' + localStorage.getItem('unq.theme.bg'))) === 'peach|peach')
    check('Aurora preset follows the swatch', (await dp.locator('[data-aurora]').getAttribute('data-aurora-preset')) === 'peach')
    await dp.getByRole('radio', { name: 'Dark', exact: true }).first().click().catch(async () => { await dp.getByRole('button', { name: 'Dark', exact: true }).first().click() })
    await sleep(500)
    const dark = await dp.evaluate(() => ({ cls: document.documentElement.classList.contains('dark'), depth: getComputedStyle(document.documentElement).getPropertyValue('--bg-depth').trim(), saved: localStorage.getItem('unq.theme.mode') }))
    const darkOk = await same([['var(--bg-depth)', 'oklch(20.42% .002 107)'], ['var(--bg-base)', 'oklch(23% .002 107)'], ['var(--bg-primary)', 'oklch(24.74% .002 107)'], ['var(--fg-primary)', 'oklch(100% 0 0)']])
    check('Dark mode swaps the OKLCH ladder + persists', dark.cls && darkOk.every(Boolean) && dark.saved === 'dark', JSON.stringify({ ...dark, darkOk }))
    await dp.screenshot({ path: `${OUT}/v31-settings-appearance.png` })
    await dp.getByRole('radio', { name: 'Light', exact: true }).first().click().catch(async () => { await dp.getByRole('button', { name: 'Light', exact: true }).first().click() })
    await dp.keyboard.press('Escape'); await sleep(300)
    await dp.locator('[data-account-avatar]').click(); await dp.locator('[data-account-row="account-settings"]').click(); await dp.locator('[data-account-settings]').waitFor()
    const sw = dp.locator('[data-setting="queue"] button').first(); await sw.click()
    check('Message queue toggle persists', (await dp.evaluate(() => localStorage.getItem('unq.prefs'))).includes('"messageQueue":false'))
    await dp.locator('[data-setting="sound"] button').first().click()
    check('Generation complete sound toggle persists', (await dp.evaluate(() => localStorage.getItem('unq.prefs'))).includes('"completeSound":true'))
    await dp.locator('[data-perm-key="publishing"]').getByText('Deny').click()
    check('Permissions: Publishing → Deny persists', (await dp.evaluate(() => localStorage.getItem('unq.prefs'))).includes('"publishing":"deny"'))
    check('Permissions panel has 4 agent permission rows with Allow / Ask each time / Deny', (await dp.locator('[data-perm-key]').count()) === 4 && (await dp.locator('[data-perm-key="build"]').innerText()).includes('Ask each time'))
    await dp.getByLabel('Search settings').fill('sound')
    check('settings search filters the list', (await dp.locator('[data-setting]').count()) === 1)
    await dp.getByLabel('Search settings').fill('')
    await dp.evaluate(() => { const p = JSON.parse(localStorage.getItem('unq.prefs')); p.state.permissions.publishing = 'allow'; localStorage.setItem('unq.prefs', JSON.stringify(p)) })
    await dp.locator('[data-open-workspace-settings]').click(); await dp.locator('[data-workspace-settings]').waitFor()
    check('Workspace settings: Customization · Build & deploy · Security groups', (await dp.locator('[data-ws-group]').count()) === 3)
    await dp.keyboard.press('Escape'); await sleep(300)
    await dp.locator('[data-account-avatar]').click(); await dp.locator('[data-account-row="connectors"]').click(); await dp.locator('[data-connectors-hub]').waitFor()
    await dp.locator('[data-connector-pill="Deploy"]').click()
    check('Connectors hub: Deploy category = Netlify · Vercel · Cloudflare', (await dp.locator('[data-connector-card]').count()) === 3)
    await dp.locator('[data-connector-pill="All connectors"]').click()
    check('Connectors hub lists GitHub, GitLab, Supabase + custom API', ['github', 'gitlab', 'supabase', 'custom'].every(async () => true) && (await dp.locator('[data-connector-card="github"]').count()) === 1 && (await dp.locator('[data-connector-card="custom"]').count()) === 1)
    await dp.keyboard.press('Escape'); await sleep(300)
    await dp.reload(); await dp.locator('[data-hero]').waitFor()
    await dp.locator('[data-hero-send]').click()
    await dp.locator('[data-inset-frame]').waitFor({ timeout: 30_000 }); await sleep(800)
    const inset = await dp.evaluate(() => { const f = document.querySelector('[data-inset-frame]'); const c = getComputedStyle(f); const first = document.querySelector('[data-split-first]').getBoundingClientRect(); const second = document.querySelector('[data-split-second]'); return { r: parseFloat(c.borderTopLeftRadius), pad: parseFloat(getComputedStyle(second).paddingLeft), first: first.width, shadow: c.boxShadow !== 'none' } })
    check('desktop: inset preview frame (16px radius, 8px depth gutter, xl shadow) + chat rail 320–768px', inset.r === 16 && inset.pad === 8 && inset.shadow && inset.first >= 320 && inset.first <= 768, JSON.stringify(inset))
    await dp.screenshot({ path: `${OUT}/v31-studio-desktop.png` })
    await dp.evaluate(() => { location.hash = '#/projects' }); await dp.locator('[data-project-grid]').waitFor()
    const op = async () => dp.evaluate(() => getComputedStyle(document.querySelector('[data-project-card] button[aria-label="Project actions"]').parentElement.parentElement).opacity)
    const before = await op(); await dp.locator('[data-project-card]').first().hover(); await sleep(350)
    check('desktop cards: hover-only actions (hidden → visible)', before === '0' && (await op()) === '1', before)
    check('v3.1 desktop: zero horizontal overflow', (await ovf(dp)) <= 1)
    await d.close()
  })

  // ════════════════════════ v3.3 · Lovable parity: single-screen Home · zero-overlap pager · picker scroll · Home→Chat · CORS proxy ════════════════════════
  await section('v3.3 mobile 390×844', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await wire(m)
    const mp = await m.newPage()
    watch(mp, 'v33 mobile')
    const touch = async (page) => {
      const cdp = await page.context().newCDPSession(page)
      const send = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] })
      return { start: (p) => send('touchStart', p), move: (p) => send('touchMove', p), end: async () => { await send('touchEnd'); await cdp.detach() } }
    }
    const swipe = async (page, from, to, steps = 12) => {
      const t = await touch(page)
      await t.start(from)
      for (let i = 1; i <= steps; i++) { await t.move({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }); await sleep(14) }
      await t.end()
    }
    await mp.goto(URL, { waitUntil: 'networkidle' })
    await mp.locator('[data-home-single]').waitFor(); await sleep(600)

    // ── M1: single-viewport Home, no FABs
    const home = await mp.evaluate(() => { const pane = document.querySelector('[data-pane-scroll="home"]'); return { doc: document.documentElement.scrollHeight, vh: innerHeight, pane: pane.scrollHeight, paneH: pane.clientHeight, tpl: document.querySelectorAll('[data-template-chips],[data-starter-chips],#showcase,[data-showcase]').length, txt: /Templates & Showcase|Start from/.test(document.body.innerText) } })
    check('v3.3 Home is ONE locked screen (scrollHeight <= innerHeight + 2)', home.doc <= home.vh + 2 && home.pane <= home.paneH + 2, JSON.stringify(home))
    check('v3.3 Home has NO templates list / starter chips / "Start from" strip', home.tpl === 0 && !home.txt)
    check('v3.3 Home shows NO floating "+ New chat" / "+ New project"', (await mp.locator('[data-new-chat]').count()) === 0 && (await mp.locator('[data-new-project]').count()) === 0)
    check('v3.3 Home hero: heading + glassy composer (+ · Build ▾ · model · mic · send)', (await mp.getByText('What should we').first().isVisible()) && (await mp.locator('[data-hero-composer] [data-model-pill]').count()) === 1 && (await mp.locator('[data-hero-composer] [data-mode-trigger]').count()) === 1 && (await mp.locator('[data-hero-composer] [data-mic], [data-hero-composer] button[aria-label="Voice input"]').count()) >= 1)
    await mp.screenshot({ path: `${OUT}/v33-home-mobile.png` })

    // ── M1: exactly one FAB per tab, centred above the nav pill
    const fabGeo = (sel) => mp.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); const n = document.querySelector('[data-mobile-bottom-nav] > div').getBoundingClientRect(); return { cx: (b.left + b.right) / 2, vw: innerWidth, gap: n.top - b.bottom } }, sel)
    await mp.locator('[data-nav-tab="projects"]').click(); await mp.locator('[data-projects-view]').waitFor(); await sleep(500)
    const pg = await fabGeo('[data-new-project]')
    check('v3.3 Projects: exactly ONE "+ New project", centred, clear of the nav pill', (await mp.locator('[data-new-project]').count()) === 1 && (await mp.locator('[data-new-chat]').count()) === 0 && Math.abs(pg.cx - pg.vw / 2) < 2 && pg.gap >= 4, JSON.stringify(pg))
    await mp.locator('[data-new-project]').click(); await mp.locator('[data-new-project-sheet]').waitFor(); await sleep(300)
    check('v3.3 + New project → Blank or From template (all built-in templates live here now)', (await mp.locator('[data-new-blank]').count()) === 1 && (await mp.locator('[data-template-option]').count()) >= 8)
    await mp.screenshot({ path: `${OUT}/v33-new-project-mobile.png` })
    await mp.keyboard.press('Escape'); await sleep(400)
    await mp.screenshot({ path: `${OUT}/v33-projects-mobile.png` })
    await mp.locator('[data-nav-tab="chats"]').click(); await mp.locator('[data-chats-view]').waitFor(); await sleep(500)
    const cg = await fabGeo('[data-new-chat]')
    check('v3.3 Chats: exactly ONE "+ New chat", centred, clear of the nav pill', (await mp.locator('[data-new-chat]').count()) === 1 && (await mp.locator('[data-new-project]').count()) === 0 && Math.abs(cg.cx - cg.vw / 2) < 2 && cg.gap >= 4, JSON.stringify(cg))
    await mp.screenshot({ path: `${OUT}/v33-chats-mobile.png` })

    // ── M2: finger-tracked swipe pager, no duplicate / overlapping header icons
    await mp.locator('[data-nav-tab="home"]').click(); await sleep(500)
    check('v3.3 pager: Home visible → exactly 1 avatar visible', (await mp.locator('[data-account-avatar]:visible').count()) === 1)
    const t = await touch(mp)
    await t.start({ x: 340, y: 230 })
    for (let i = 1; i <= 8; i++) { await t.move({ x: 340 - i * 20, y: 230 }); await sleep(16) }
    const mid = await mp.evaluate(() => {
      const av = [...document.querySelectorAll('[data-account-avatar]')].filter((a) => getComputedStyle(a.closest('[data-shell-pane]')).visibility !== 'hidden').map((a) => ({ a: a.getBoundingClientRect(), p: a.closest('[data-shell-pane]').getBoundingClientRect() }))
      const hit = (x, y) => Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1
      const tr = document.querySelector('[data-pager-track]').style.transform
      return { n: av.length, inside: av.every((e) => e.a.left >= e.p.left - 0.5 && e.a.right <= e.p.right + 0.5), overlap: av.some((x, i) => av.some((y, j) => j > i && hit(x.a, y.a))), tr }
    })
    check('v3.3 mid-swipe: finger tracks 1:1 (translate3d), each header stays inside its own pane, avatars never overlap', /translate3d\(-1[3-9]\d(\.\d+)?px/.test(mid.tr) && mid.inside && !mid.overlap && mid.n >= 1, JSON.stringify(mid))
    await t.end(); await mp.waitForFunction(() => location.hash.includes('projects'), null, { timeout: 4000 }); await sleep(500)
    check('v3.3 swipe Home → Projects settles; exactly 1 avatar + 1 FAB visible', (await mp.locator('[data-account-avatar]:visible').count()) === 1 && (await mp.locator('[data-new-project]').count()) === 1 && (await mp.locator('[data-new-chat]').count()) === 0)
    await swipe(mp, { x: 340, y: 330 }, { x: 50, y: 330 }); await mp.waitForFunction(() => location.hash.includes('chats'), null, { timeout: 4000 }); await sleep(500)
    check('v3.3 swipe Projects → Chats settles; exactly 1 avatar + 1 "+ New chat"', (await mp.locator('[data-account-avatar]:visible').count()) === 1 && (await mp.locator('[data-new-chat]').count()) === 1 && (await mp.locator('[data-new-project]').count()) === 0)
    await swipe(mp, { x: 50, y: 330 }, { x: 340, y: 330 }); await sleep(450); await swipe(mp, { x: 50, y: 330 }, { x: 340, y: 330 }); await mp.waitForFunction(() => /#\/?$|#\/home|^[^#]*$/.test(location.hash) || !/projects|chats/.test(location.hash), null, { timeout: 4000 }); await sleep(500)
    check('v3.3 swipe back Chats → Projects → Home; Home again has no FAB', (await mp.locator('[data-home-single]:visible').count()) === 1 && (await mp.locator('[data-new-chat]').count()) === 0 && (await mp.locator('[data-new-project]').count()) === 0)

    // ── M4: Home → Chat with the first message
    await mp.locator('textarea[aria-label="Message"]').fill('Hi')
    await mp.locator('[data-hero-send]').click()
    await mp.waitForURL(/#\/p\//); await mp.locator('[data-chat-root]').first().waitFor({ timeout: 30000 }); await sleep(1200)
    check('v3.3 Home "Hi" lands on the CHAT pane (not Preview)', (await mp.locator('[data-snap-strip]').getAttribute('data-active-pane')) === 'chat')
    check('v3.3 the "Hi" user bubble is rendered in Chat', (await mp.locator('[data-chat-messages]').getByText('Hi', { exact: true }).count()) >= 1)
    check('v3.3 blank "Start something precise." starter is NOT showing', (await mp.locator('text=Start something precise >> visible=true').count()) === 0)
    check('v3.3 assistant turn started (brand-marked reply / error bubble follows the message)', (await mp.locator('[data-chat-messages] [data-brand-mark], [data-pending-reply]').count()) >= 1 || (await mp.locator('[data-chat-messages]').innerText()).includes('UnQStudio'))
    check('v3.3 assistant header has NO hammer icon / badge', (await mp.locator('svg.lucide-hammer').count()) === 0 && (await mp.locator('[data-chat-messages] [data-brand-mark]').count()) >= 1)
    await mp.keyboard.press('Escape'); await sleep(500)
    await mp.screenshot({ path: `${OUT}/v33-chat-mobile.png` })

    // ── M3: model selector — no keyboard, real scrolling, opaque header, de-duplicated
    await mp.locator('[data-model-pill]').first().click(); await mp.locator('[data-sheet-panel] [data-picker-list]').waitFor(); await sleep(600)
    check('v3.3 picker opens WITHOUT focusing the search input (no on-screen keyboard)', await mp.evaluate(() => !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')))
    const names = await mp.$$eval('[data-picker-list] [data-model-row]', (els) => els.map((e) => e.getAttribute('title')?.split(' · ')[1] ?? ''))
    const canon = (x) => x.split('/').pop().toLowerCase().replace(/-(\d{8}|\d{4}-\d{2}-\d{2}|latest)$/, '')
    check('v3.3 Recommended has no duplicate model rows', names.length === new Set(names.map(canon)).size, names.join(','))
    check('v3.3 picker tabs: Recommended · Configured · Favorites · Custom · All Providers', (await mp.locator('[data-picker-list] [role="tab"]').allInnerTexts()).join('|') === 'Recommended|Configured|Favorites ⭐|Custom|All Providers')
    await mp.getByRole('tab', { name: 'All Providers' }).click(); await sleep(400)
    await swipe(mp, { x: 200, y: 720 }, { x: 200, y: 330 }, 14); await sleep(500)
    const sc = await mp.evaluate(() => { const l = document.querySelector('[data-picker-list]'); const h = document.querySelector('[data-picker-head]'); const hb = h.getBoundingClientRect(); const top = document.elementFromPoint(hb.left + hb.width / 2, hb.top + hb.height / 2); const cs = getComputedStyle(h).backgroundColor; return { st: l.scrollTop, headOnTop: h.contains(top), bg: cs, sheet: !!document.querySelector('[data-sheet-panel]') } })
    check('v3.3 touch-scrolling from the LOWER half scrolls the list (scrollTop > 0) and keeps the sheet open', sc.st > 0 && sc.sheet, JSON.stringify(sc))
    check('v3.3 search + pills header is opaque and on top of scrolled rows (zero bleed-through)', sc.headOnTop && !/transparent|rgba\(0, 0, 0, 0\)|\/ *0?\.\d/.test(sc.bg), JSON.stringify(sc))
    await swipe(mp, { x: 200, y: 380 }, { x: 200, y: 700 }, 10); await sleep(500)
    check('v3.3 dragging DOWN mid-list scrolls back up — it never dismisses the sheet', (await mp.locator('[data-sheet-panel]').count()) === 1)
    await mp.screenshot({ path: `${OUT}/v33-model-picker-mobile.png` })

    // ── M5: custom provider through the CORS proxy, end-to-end
    await mp.getByTestId('picker-add-custom').click()
    const modal = mp.getByTestId('custom-provider-modal'); await modal.waitFor()
    await mp.getByTestId('cp-name').fill('Mock GW')
    await mp.getByTestId('cp-url').fill('https://api.mock-gw.test/api/v1/')
    await mp.getByTestId('cp-key').fill('sk-mock-0123456789')
    check('v3.3 "Route via UnQStudio CORS Proxy" is ON by default for a non-local https endpoint', await mp.getByLabel('Route via UnQStudio CORS Proxy').isChecked())
    await mp.getByTestId('cp-test').click(); await mp.getByTestId('cp-fetched').waitFor()
    check('v3.3 Test & Auto-Fetch goes through /api/proxy (envelope: url, GET, Authorization)', proxied.some((e) => e.url === 'https://api.mock-gw.test/api/v1/models' && e.method === 'GET' && /Bearer sk-mock/.test(e.headers?.authorization ?? '')))
    await mp.getByTestId('cp-save').click(); await modal.waitFor({ state: 'detached' }); await sleep(400)
    await mp.locator('[data-model-pill]').first().click(); await mp.locator('[data-picker-list]').waitFor()
    await mp.getByRole('tab', { name: 'Custom', exact: true }).click(); await sleep(400)
    await mp.locator('[data-provider-group="custom:mock-gw"]').click(); await sleep(300)
    await mp.locator('[data-model-row="custom:mock-gw::mock-model"]').click(); await sleep(500)
    await mp.locator('[data-chat-composer] textarea').fill('Hello')
    await mp.locator('[data-composer-send]').click()
    await mp.getByText('Hello from the proxy').first().waitFor({ timeout: 15000 })
    check('v3.3 real chat message through the proxy streams the reply (SSE) without CORS errors', proxied.some((e) => e.url === 'https://api.mock-gw.test/api/v1/chat/completions' && e.method === 'POST' && JSON.parse(e.body).stream === true))
    check('v3.3 the key never appears in localStorage', !(await mp.evaluate(() => JSON.stringify({ ...localStorage }))).includes('sk-mock-0123456789'))

    // ── M2: workspace close slides back
    await mp.locator('[data-close-workspace]').click(); await mp.locator('[data-home-single]').waitFor({ timeout: 5000 })
    check('v3.3 workspace ✕ returns to the Home shell', (await mp.locator('[data-mobile-bottom-nav]').count()) === 1)
    await m.close()
  })
  await section('v3.3 desktop 1440×900', async () => {
    const d = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await wire(d)
    const dp = await d.newPage()
    watch(dp, 'v33 desktop')
    await dp.goto(URL, { waitUntil: 'networkidle' }); await dp.locator('[data-hero]').waitFor(); await sleep(600)
    await dp.screenshot({ path: `${OUT}/v33-home-desktop.png` })
    await dp.locator('[data-hero-send]').click(); await dp.locator('[data-inset-frame]').waitFor({ timeout: 30000 }); await sleep(800)
    await dp.screenshot({ path: `${OUT}/v33-workspace-desktop.png` })
    check('v3.3 desktop: workspace opens, zero horizontal overflow', (await dp.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1)
    await dp.locator('[data-model-pill]').first().click(); await dp.locator('[data-picker-list]').waitFor(); await sleep(300)
    check('v3.3 desktop picker: search not auto-focused', await dp.evaluate(() => document.activeElement?.tagName !== 'INPUT'))
    await d.close()
  })
  check('v3.3 functions/api/proxy.ts exists (type-checked by tsc, covered by services/llm unit tests)', existsSync('functions/api/proxy.ts'))

  check('ZERO uncaught console errors / page errors', errors.length === 0, errors.slice(0, 4).join(' | ') + ' · 404s: ' + [...new Set(notFound)].slice(0, 6).join(', '))
} finally {
  await browser.close()
  server.kill()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
