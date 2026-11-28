/// Lazy Web Worker: loads `typescript` + the bundled lib.d.ts files ONLY when the first type-check is requested, so the main
/// JS chunk stays lean. Protocol: host → worker `{ id, files }`; worker → host `{ id, diagnostics, ms } | { id, error }`.
import type * as TS from 'typescript'
import { typeCheckFiles, type TsDiagnostic } from './tsCheck'

const libModules = import.meta.glob('/node_modules/typescript/lib/lib.*.d.ts', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>
let ready: Promise<{ ts: typeof TS; libs: Record<string, string> }> | null = null
const load = () => (ready ??= (async () => {
  const ts = (await import('typescript')) as unknown as typeof TS
  const libs: Record<string, string> = {}
  await Promise.all(Object.entries(libModules).filter(([p]) => !/lib\.(webworker|tsserverlibrary|typescript)/.test(p)).map(async ([p, f]) => { libs[p.split('/').pop()!] = await f() }))
  return { ts, libs }
})())

const ctx = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown) => void }
ctx.onmessage = async (e: MessageEvent<{ id: number; files: Record<string, string> }>) => {
  const { id, files } = e.data
  try {
    const t0 = performance.now()
    const { ts, libs } = await load()
    const diagnostics: TsDiagnostic[] = typeCheckFiles(ts, files, libs)
    ctx.postMessage({ id, diagnostics, ms: Math.round(performance.now() - t0) })
  } catch (err) { ctx.postMessage({ id, error: String(err instanceof Error ? err.message : err) }) }
}
