// Headless browser verification against the production build (`npm run build` first).
// Usage: npm run e2e   (requires: npx playwright install chromium)
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4173
const URL = `http://localhost:${PORT}/`
const OUT = process.env.E2E_SHOTS ?? '/tmp/unq-shots'
mkdirSync(OUT, { recursive: true })

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 50; i++) { try { if ((await fetch(URL)).ok) break } catch {} await sleep(200) }

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`) }
const errors = []

const browser = await chromium.launch({ args: ['--no-sandbox'] })
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  await page.goto(URL, { waitUntil: 'networkidle' })
  check('home loads with hero', await page.getByText('Describe it.').isVisible())
  check('8 starter templates listed', (await page.locator('button:has(svg)', { hasText: /Blank Starter|SaaS Landing Page|Analytics Dashboard|Designer Portfolio|Product Storefront|AI Chat App|Kanban Board|Editorial Blog/ }).count()) === 8)
  await page.screenshot({ path: `${OUT}/home.png` })

  // open the SaaS template (compiles with real esbuild-wasm + esm.sh + Tailwind runtime)
  await page.getByRole('button', { name: /SaaS Landing Page/ }).click()
  await page.getByRole('button', { name: 'Create project' }).click()
  await page.waitForURL(/#\/p\//)
  const frame = page.frameLocator('iframe[title="Live preview"]')
  await frame.locator('h1').first().waitFor({ timeout: 90_000 })
  const h1 = await frame.locator('h1').first().textContent()
  check('template compiled by esbuild-wasm and rendered in the sandboxed iframe', /Know what your product is doing/.test(h1 ?? ''), h1 ?? '')
  await sleep(2500)
  const bg = await frame.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)
  const accent = await frame.locator('a:has-text("Get started")').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  check('Tailwind runtime styled the preview (accent button has a colour)', accent !== 'rgba(0, 0, 0, 0)' && accent !== bg, `${accent} on ${bg}`)
  await page.screenshot({ path: `${OUT}/studio.png` })

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

  // theme toggle
  const before = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  await page.getByRole('button', { name: 'Toggle theme' }).first().click()
  await sleep(400)
  const after = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  check('light/dark theme toggles', before !== after)

  // command palette + settings
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder(/Search files, actions/).waitFor()
  await page.keyboard.type('providers')
  check('command palette finds actions', await page.getByText('Manage providers & API keys').isVisible())
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Settings' }).first().click()
  for (const t of ['General', 'Providers', 'Connections', 'Prompts', 'Data', 'Debug', 'Features']) await page.getByRole('tab', { name: t }).waitFor({ timeout: 5000 })
  check('settings hub exposes all 7 tabs', true)
  await page.getByRole('tab', { name: 'Providers' }).click()
  check('providers tab lists 20 built-in providers', (await page.getByRole('switch').count()) >= 20)
  await page.keyboard.press('Escape')

  // theme studio live edit
  await page.getByRole('tab', { name: 'Theme' }).click()
  await page.getByText('Theme Studio').waitFor()
  check('Theme Studio opens next to the preview', true)

  // mobile
  const m = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  const mp = await m.newPage()
  mp.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`))
  await mp.goto(URL, { waitUntil: 'networkidle' })
  check('mobile home has no horizontal overflow', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await mp.screenshot({ path: `${OUT}/mobile-home.png` })
  await mp.getByRole('button', { name: 'Create project' }).click()
  await mp.waitForURL(/#\/p\//)
  await mp.getByText('Chat', { exact: true }).first().waitFor({ timeout: 20_000 })
  check('mobile workspace has no horizontal overflow', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await mp.screenshot({ path: `${OUT}/mobile-studio.png` })
} catch (e) {
  check('E2E run completed', false, String(e))
} finally {
  await browser.close()
  server.kill()
}

const noisy = errors.filter((e) => !/Failed to load resource|favicon/.test(e))
check('zero console/page errors', noisy.length === 0, noisy.slice(0, 3).join(' | '))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`)
process.exit(failed.length ? 1 : 0)
