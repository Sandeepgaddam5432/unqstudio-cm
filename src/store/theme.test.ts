import { beforeEach, describe, expect, it } from 'vitest'
import { BG_PRESETS, DEFAULT_CUSTOM, isBgPresetId, parseCustom, resolvePreset, useTheme } from './theme'
import { useApp } from './app'

describe('dashboard background theme store', () => {
  beforeEach(() => { localStorage.clear(); useTheme.setState({ bg: 'classic', custom: DEFAULT_CUSTOM }) })

  it('ships the four named Aurora presets plus custom', () => {
    expect(BG_PRESETS.map((p) => p.label)).toEqual(['Classic Aurora', 'Soft Horizon', 'Warm Peach', 'Minimal Monochrome'])
    expect(isBgPresetId('custom')).toBe(true)
    expect(isBgPresetId('nope')).toBe(false)
  })
  it('persists the selected preset to localStorage and tags <html>', () => {
    useTheme.getState().setBg('peach')
    expect(localStorage.getItem('unq.theme.bg')).toBe('peach')
    expect(document.documentElement.dataset.dashboardBg).toBe('peach')
  })
  it('stores valid custom colours, rejects invalid ones, and selects the custom preset', () => {
    useTheme.getState().setCustom({ a: '#112233' })
    expect(useTheme.getState().bg).toBe('custom')
    expect(JSON.parse(localStorage.getItem('unq.theme.custom')!)).toEqual({ a: '#112233', b: DEFAULT_CUSTOM.b })
    useTheme.getState().setCustom({ b: 'red' })
    expect(useTheme.getState().custom.b).toBe(DEFAULT_CUSTOM.b)
    expect(resolvePreset('custom', useTheme.getState().custom).a).toBe('#112233')
  })
  it('falls back to defaults for corrupt custom JSON', () => { expect(parseCustom('{bad')).toEqual(DEFAULT_CUSTOM) })
  it('mode changes flow into the app store and localStorage', () => {
    useTheme.getState().setMode('dark')
    expect(useApp.getState().theme).toBe('dark')
    expect(localStorage.getItem('unq.theme.mode')).toBe('dark')
    useTheme.getState().setMode('system')
  })
})
