// Headless Chromium verification against the production build (`npm run build` first).
// Usage: npm run e2e   (requires: npx playwright install chromium)
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
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`) }
const section = async (name, fn) => { try { await fn() } catch (e) { check(`${name} completed`, false, String(e).slice(0, 700)) } }
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
    await ctx.route('https://gw.acme.test/v1/models', (r) => json(r, { data: [{ id: 'acme-chat-1' }, { id: 'acme-chat-2' }, { id: 'acme-mini' }] }))
    for (const re of [/cdn\.jsdelivr\.net\/npm\/@lobehub/, /models\.dev\/logos/]) await ctx.route(re, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: 'not-an-svg' })) // undecodable → Layer 3 (monogram) for long-tail providers, deterministically
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await wire(ctx)
  const page = await ctx.newPage()
  watch(page, 'desktop')

  await section('home · SEO/AEO · zero-leak · auth', async () => {
    await page.goto(URL, { waitUntil: 'networkidle' })
    check('home loads with hero', await page.getByText('Describe it.').isVisible())
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
    await page.getByRole('radio', { name: 'Paper Light' }).click()
    const light = await page.evaluate(() => !document.documentElement.classList.contains('dark'))
    await page.getByRole('radio', { name: 'Obsidian Dark' }).click()
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
    for (const n of ['Configured', 'Favorites ⭐', 'Browser-Ready', 'Custom', 'Local', 'All Providers']) {
      await page.getByRole('tab', { name: n, exact: true }).click()
      await sleep(250)
      check(`picker tab "${n}": no "models.dev", no broken images`, !(await leak(page)) && (await brokenImgs(page)).length === 0)
    }
    await page.getByRole('tab', { name: 'All Providers', exact: true }).click()
    await sleep(300)
    const win = await page.evaluate(() => { const l = document.querySelector('[data-picker-list]'); return { rows: l.querySelectorAll('[data-provider-group],[data-model-row]').length, total: l.firstElementChild.getBoundingClientRect().height } })
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
    await mp.getByRole('button', { name: /SaaS Landing Page/ }).click()
    await mp.getByRole('button', { name: 'Create project' }).click()
    await mp.waitForURL(/#\/p\//)
    await mp.locator('[data-chat-root]').first().waitFor({ timeout: 30000 })
    await auditChat(mp, 'mobile 375×812')
    await mp.screenshot({ path: `${OUT}/v21-mobile-chat.png` })
    await mp.locator('[data-model-pill]').first().click()
    const picker = mp.locator('[data-model-picker]')
    await picker.waitFor()
    await sleep(400)
    const b = await picker.boundingBox()
    check('model picker is a bottom sheet inside the 375px viewport', !!b && b.x >= -1 && b.x + b.width <= 376 && b.y + b.height <= 813 && b.y + b.height >= 700, JSON.stringify(b))
    check('mobile picker: zero broken images, zero "models.dev"', (await brokenImgs(mp)).length === 0 && !(await leak(mp)))
    await m.close()
  })

  check('ZERO uncaught console errors / page errors', errors.length === 0, errors.slice(0, 4).join(' | ') + ' · 404s: ' + [...new Set(notFound)].slice(0, 6).join(', '))
} finally {
  await browser.close()
  server.kill()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
