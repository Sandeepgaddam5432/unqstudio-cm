import { describe, expect, it } from 'vitest'
import { applyQuickEditToClasses, buildInspectorPrompt, findSourceHint, planSourceEdit, rgbToHex } from './inspectorEdit'
import { contrastText, parseTheme, writeFontLink, writeTheme, THEME_PRESETS } from './theme'
import { BASE_CSS, DEFAULT_THEME, indexHtml } from '@/core/vfs/scaffold'

describe('inspector edit mapping', () => {
  it('converts colors', () => {
    expect(rgbToHex('rgb(255, 106, 61)')).toBe('#ff6a3d')
    expect(rgbToHex('rgba(0, 0, 0, 0)')).toBe('#ffffff')
  })
  it('replaces conflicting tailwind utilities with arbitrary values', () => {
    const out = applyQuickEditToClasses('p-4 text-sm text-gray-500 bg-white rounded-lg hover:bg-gray-50 font-medium', { color: '#ff0000', bg: '#000000', padding: 24, radius: 8, fontSize: 18 })
    expect(out.split(' ')).toEqual(expect.arrayContaining(['font-medium', 'hover:bg-gray-50', 'text-[#ff0000]', 'bg-[#000000]', 'p-[24px]', 'rounded-[8px]', 'text-[18px]']))
    for (const gone of ['p-4', 'text-sm', 'text-gray-500', 'bg-white', 'rounded-lg']) expect(out.split(' ')).not.toContain(gone)
    expect(applyQuickEditToClasses('text-center bg-gradient-to-r', { color: '#fff' })).toBe('text-center bg-gradient-to-r text-[#fff]')
  })
  const files = {
    '/src/App.tsx': 'export default () => (\n  <div>\n    <h1 className="text-4xl font-bold">Hello world</h1>\n    <p className="p-4 text-gray-500">Unique copy</p>\n    <button className="rounded px-3">Save</button>\n    <button className="rounded px-3">Save</button>\n  </div>\n)',
  }
  it('persists text and class edits into the unique matching source', () => {
    const plan = planSourceEdit(files, { tag: 'p', classes: 'p-4 text-gray-500', text: 'Unique copy' }, { text: 'Changed copy', color: '#123456', padding: 8 })
    expect(plan.failed).toEqual([])
    expect(plan.files['/src/App.tsx']).toContain('>Changed copy<')
    expect(plan.files['/src/App.tsx']).toContain('className="text-[#123456] p-[8px]"')
    expect(plan.files['/src/App.tsx']).toContain('Hello world')
  })
  it('refuses ambiguous or unknown matches instead of guessing', () => {
    const amb = planSourceEdit(files, { tag: 'button', classes: 'rounded px-3', text: 'Save' }, { bg: '#fff', text: 'Store' })
    expect(Object.keys(amb.files)).toEqual([])
    expect(amb.failed).toHaveLength(2)
    expect(amb.failed[0]).toMatch(/ambiguous/)
    expect(planSourceEdit(files, { tag: 'div', classes: '', text: '' }, { bg: '#fff' }).failed[0]).toMatch(/no class names/)
    expect(planSourceEdit(files, { tag: 'p', classes: 'dynamic', text: '' }, { bg: '#fff' }).failed[0]).toMatch(/not found/)
  })
  it('finds source hints and builds the AI prompt', () => {
    const hint = findSourceHint(files, { classes: 'text-4xl font-bold', text: 'Hello world' })
    expect(hint).toEqual({ path: '/src/App.tsx', line: 3 })
    const prompt = buildInspectorPrompt({ tag: 'h1', classes: 'text-4xl font-bold', text: 'Hello world', html: '<h1 class="text-4xl font-bold">Hello world</h1>' }, hint)
    expect(prompt).toContain('<h1 class="text-4xl font-bold">Hello world</h1>')
    expect(prompt).toContain('/src/App.tsx:3')
  })
})

describe('theme engine', () => {
  it('parses the scaffold theme block and round-trips edits', () => {
    const t = parseTheme(BASE_CSS)!
    expect(t.accent).toBe(DEFAULT_THEME.accent)
    expect(t.dark.bg).toBe(DEFAULT_THEME.dark.bg)
    expect(t.radius).toBe(12)
    expect(t.font).toBe('Inter')
    const next = writeTheme(BASE_CSS, { ...t, accent: '#00ff00', radius: 4, font: 'Lora', dark: { ...t.dark, bg: '#111111' } })
    const back = parseTheme(next)!
    expect(back).toMatchObject({ accent: '#00ff00', radius: 4, font: 'Lora' })
    expect(back.dark.bg).toBe('#111111')
    expect(next.match(/unq-theme:start/g)).toHaveLength(1)
  })
  it('injects a theme block into stylesheets that lack one', () => {
    const out = writeTheme('@import "tailwindcss";\nbody{margin:0}', DEFAULT_THEME)
    expect(out).toContain('unq-theme:start')
    expect(out).toContain('--color-accent: var(--accent)')
    expect(out).toContain('body{margin:0}')
    expect(parseTheme('body{}')).toBeNull()
  })
  it('swaps google font links, picks readable foregrounds and ships presets', () => {
    const html = writeFontLink(indexHtml('x'), 'DM Sans')
    expect(html).toContain('family=DM+Sans')
    expect(html).not.toContain('family=Inter')
    expect(contrastText('#ffffff')).toBe('#09090b')
    expect(contrastText('#111111')).toBe('#ffffff')
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(6)
  })
})
