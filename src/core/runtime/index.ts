import type { IRuntimeEngine } from './types'

type Factory = () => Promise<IRuntimeEngine>

let factory: Factory = async () => new (await import('./esbuildEngine')).EsbuildWasmEngine()
let instance: Promise<IRuntimeEngine> | null = null

/** Swap the runtime (e.g. WebContainers / remote sandbox) without touching UI or AI code. */
export function registerRuntime(f: Factory) {
  factory = f
  instance = null
}
export function getRuntime(): Promise<IRuntimeEngine> {
  return (instance ??= factory())
}

export * from './types'
export { buildFixPrompt } from './resolver'
