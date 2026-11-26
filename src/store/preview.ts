import { create } from 'zustand'
import { uid } from '@/lib/util'
import type { SerializedError } from '@/core/runtime/types'

export type Device = 'desktop' | 'tablet' | 'mobile' | 'custom'
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'build'
export interface LogEntry { id: string; level: LogLevel; text: string; ts: number }

export interface ElementInfo {
  tag: string; id: string; classes: string; text: string; editableText: boolean; html: string; selector: string
  rect: { x: number; y: number; w: number; h: number }
  styles: Record<string, string>
}

export const DEVICE_SIZES: Record<Exclude<Device, 'custom'>, { w: number; h: number; label: string }> = {
  desktop: { w: 0, h: 0, label: 'Desktop' },
  tablet: { w: 820, h: 1180, label: 'Tablet' },
  mobile: { w: 390, h: 844, label: 'Mobile' },
}

interface PreviewState {
  status: 'idle' | 'initializing' | 'building' | 'ready' | 'error'
  progress: { message: string; pct: number | null } | null
  html: string | null
  lastHash: string | null
  buildErrors: SerializedError[]
  runtimeErrors: SerializedError[]
  warnings: SerializedError[]
  durationMs: number | null
  logs: LogEntry[]
  device: Device
  customW: number
  customH: number
  rotated: boolean
  zoom: 'fit' | number
  appearance: 'light' | 'dark'
  consoleOpen: boolean
  inspectMode: boolean
  selected: ElementInfo | null
  reloadKey: number
  /** Current in-app route reported by the preview bridge (e.g. `/dashboard`). */
  route: string
  errorDismissed: boolean
  set: (p: Partial<Omit<PreviewState, 'set'>>) => void
  addLog: (level: LogLevel, text: string, ts?: number) => void
  clearLogs: () => void
  addRuntimeError: (e: SerializedError) => void
  reload: () => void
}

export const usePreview = create<PreviewState>((set) => ({
  status: 'idle', progress: null, html: null, lastHash: null, buildErrors: [], runtimeErrors: [], warnings: [], durationMs: null, logs: [],
  device: 'desktop', customW: 1024, customH: 768, rotated: false, zoom: 'fit', appearance: 'light', consoleOpen: false,
  inspectMode: false, selected: null, reloadKey: 0, route: '/', errorDismissed: false,
  set: (p) => set(p),
  addLog: (level, text, ts) => set((s) => ({ logs: [...s.logs.slice(-299), { id: uid('l'), level, text, ts: ts ?? Date.now() }] })),
  clearLogs: () => set({ logs: [], runtimeErrors: [] }),
  addRuntimeError: (e) =>
    set((s) => (s.runtimeErrors.some((x) => x.message === e.message) ? s : { runtimeErrors: [...s.runtimeErrors.slice(-9), e], errorDismissed: false })),
  reload: () => set((s) => ({ reloadKey: s.reloadKey + 1, runtimeErrors: [], errorDismissed: false, selected: null })),
}))
