import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRIDGE_SCRIPT } from '@/core/runtime/bridgeScript'
import { navigateCommand, normalizeRoute, parseRouteMessage } from '@/core/runtime/routeBridge'
import { applyQuickEditToClasses, composeAskPrompt, planSourceEdit } from '@/core/runtime/inspectorEdit'
import { selectionRect } from './VisualInspector'

describe('route bar helpers', () => {
  it('normalises routes and refuses external URLs', () => {
    expect(normalizeRoute('dashboard')).toBe('/dashboard')
    expect(normalizeRoute('#/pricing')).toBe('/pricing')
    expect(normalizeRoute('  /a  b//c ')).toBe('/a-b/c')
    expect(normalizeRoute('https://evil.example')).toBe('/')
    expect(normalizeRoute('javascript:alert(1)')).toBe('/')
    expect(normalizeRoute('//evil.example')).toBe('/')
    expect(normalizeRoute('')).toBe('/')
    expect(navigateCommand('x')).toEqual({ type: 'route:navigate', path: '/x' })
  })
  it('validates untrusted route messages from the iframe', () => {
    expect(parseRouteMessage({ type: 'route', path: '/dashboard' })).toEqual({ path: '/dashboard' })
    expect(parseRouteMessage({ type: 'route', path: 'https://x.y' })).toEqual({ path: '/' })
    expect(parseRouteMessage({ type: 'console' })).toBeNull()
    expect(parseRouteMessage(null)).toBeNull()
  })
})

describe('bridge route messaging (script evaluated in jsdom)', () => {
  afterEach(() => { vi.restoreAllMocks() })
  it('navigates on route:navigate, reports the path and handles back', async () => {
    const posted: Array<Record<string, unknown>> = []
    vi.spyOn(window.parent, 'postMessage').mockImplementation(((m: Record<string, unknown>) => { posted.push(m) }) as never)
    ;(0, eval)(BRIDGE_SCRIPT)
    window.dispatchEvent(new MessageEvent('message', { data: { __unq: true, type: 'route:navigate', path: '/dashboard' } }))
    await new Promise((r) => setTimeout(r, 10))
    expect(location.pathname).toBe('/dashboard')
    expect(posted.some((m) => m.type === 'route' && m.path === '/dashboard')).toBe(true)
    expect(BRIDGE_SCRIPT).toContain('#3B82F6')
    expect(BRIDGE_SCRIPT).toContain("m.type === 'route:back'")
  })
})

describe('visual inspector payloads', () => {
  it('maps the selection rect through the preview zoom scale', () => {
    expect(selectionRect({ x: 10, y: 20, w: 100, h: 50 }, { left: 100, top: 40, width: 195, offsetWidth: 390 })).toEqual({ x: 105, y: 50, width: 50, height: 25 })
  })
  it('adds font weight utilities replacing existing weights', () => {
    expect(applyQuickEditToClasses('text-sm font-bold p-2', { fontWeight: 600 })).toBe('text-sm p-2 font-[600]')
  })
  it('plans a source edit for text + weight and reports unlocatable elements', () => {
    const files = { '/src/App.tsx': 'export default () => <h1 className="text-3xl font-bold">Hello</h1>' }
    const plan = planSourceEdit(files, { tag: 'h1', classes: 'text-3xl font-bold', text: 'Hello', editableText: true }, { text: 'Hi there', fontWeight: 800 })
    expect(plan.failed).toEqual([])
    expect(plan.files['/src/App.tsx']).toContain('>Hi there<')
    expect(plan.files['/src/App.tsx']).toContain('font-[800]')
    const miss = planSourceEdit(files, { tag: 'p', classes: 'nope', text: '' }, { fontWeight: 700 })
    expect(miss.failed.length).toBe(1)
  })
  it('composes the Ask-AI message with the DOM node, classes, source hint and request', () => {
    const msg = composeAskPrompt({ tag: 'button', classes: 'btn px-4', text: 'Buy', html: '<button class="btn px-4">Buy</button>', selector: 'body > button' }, { path: '/src/App.tsx', line: 12 }, '  make it bigger ')
    expect(msg).toContain('button')
    expect(msg).toContain('btn px-4')
    expect(msg).toContain('/src/App.tsx')
    expect(msg.endsWith('Requested change: make it bigger')).toBe(true)
  })
})
