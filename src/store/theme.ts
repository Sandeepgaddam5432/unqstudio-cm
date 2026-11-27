import { create } from 'zustand'
import { useApp, type ThemePref } from '@/store/app'

/** Dashboard background presets for the Home Aurora hero (persisted in localStorage — see DOCS/09 §5). */
export type BgPresetId = 'classic' | 'horizon' | 'peach' | 'mono' | 'custom'
export interface BgPreset { id: BgPresetId; label: string; a: string; b: string; c: string }

export const BG_PRESETS: BgPreset[] = [
  { id: 'classic', label: 'Classic Aurora', a: '#6d7bff', b: '#a78bfa', c: '#38bdf8' },
  { id: 'horizon', label: 'Soft Horizon', a: '#7cc4ff', b: '#b6a8ff', c: '#9ee7d7' },
  { id: 'peach', label: 'Warm Peach', a: '#ffcfa3', b: '#ffb98f', c: '#ffe6b8' },
  { id: 'mono', label: 'Minimal Monochrome', a: '#a1a1aa', b: '#d4d4d8', c: '#71717a' },
]

export interface CustomBg { a: string; b: string }
export const DEFAULT_CUSTOM: CustomBg = { a: '#4f7cff', b: '#8b5cf6' }
const K_MODE = 'unq.theme.mode', K_BG = 'unq.theme.bg', K_CUSTOM = 'unq.theme.custom'
const HEX = /^#[0-9a-f]{6}$/i

export function isBgPresetId(v: unknown): v is BgPresetId {
  return v === 'custom' || BG_PRESETS.some((p) => p.id === v)
}
export function parseCustom(raw: string | null): CustomBg {
  try {
    const o = JSON.parse(raw ?? '') as Partial<CustomBg>
    return { a: HEX.test(o.a ?? '') ? o.a! : DEFAULT_CUSTOM.a, b: HEX.test(o.b ?? '') ? o.b! : DEFAULT_CUSTOM.b }
  } catch { return DEFAULT_CUSTOM }
}
/** Resolve a preset id (+ custom colours) to the three gradient stops used by the Aurora SVG. */
export function resolvePreset(id: BgPresetId, custom: CustomBg): BgPreset {
  if (id === 'custom') return { id: 'custom', label: 'Custom', a: custom.a, b: custom.b, c: custom.a }
  return BG_PRESETS.find((p) => p.id === id) ?? BG_PRESETS[0]!
}

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

interface ThemeState {
  bg: BgPresetId
  custom: CustomBg
  setBg: (id: BgPresetId) => void
  setCustom: (c: Partial<CustomBg>) => void
  setMode: (m: ThemePref) => void
}

const initialBg = ls.get(K_BG)

export const useTheme = create<ThemeState>()((set, get) => ({
  bg: isBgPresetId(initialBg) ? initialBg : 'classic',
  custom: parseCustom(ls.get(K_CUSTOM)),
  setBg: (bg) => { ls.set(K_BG, bg); set({ bg }); applyBgAttr(bg) },
  setCustom: (c) => {
    const custom = { ...get().custom, ...c }
    if (!HEX.test(custom.a) || !HEX.test(custom.b)) return
    ls.set(K_CUSTOM, JSON.stringify(custom)); ls.set(K_BG, 'custom'); set({ custom, bg: 'custom' }); applyBgAttr('custom')
  },
  setMode: (m) => { ls.set(K_MODE, m); useApp.getState().setTheme(m) },
}))

export function applyBgAttr(id: BgPresetId) {
  if (typeof document !== 'undefined') document.documentElement.dataset.dashboardBg = id
}

/** Restore the persisted mode + dashboard background at startup. */
export function initTheme() {
  const m = ls.get(K_MODE)
  if ((m === 'system' || m === 'light' || m === 'dark') && useApp.getState().theme !== m) useApp.getState().setTheme(m)
  applyBgAttr(useTheme.getState().bg)
}
