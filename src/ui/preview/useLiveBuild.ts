import { useEffect } from 'react'
import type { VirtualFileSystem } from '@/core/vfs/vfs'
import { getRuntime } from '@/core/runtime'
import { usePreview } from '@/store/preview'
import { logEvent } from '@/store/events'

/** Debounced hot-rebuild: recompiles whenever the VFS content changes (latest build wins). */
export function useLiveBuild(vfs: VirtualFileSystem | null) {
  useEffect(() => {
    if (!vfs) return
    usePreview.setState({ status: 'idle', html: null, lastHash: null, buildErrors: [], runtimeErrors: [], warnings: [], logs: [], selected: null, inspectMode: false, progress: null })
    let timer: ReturnType<typeof setTimeout> | undefined
    let running = false
    let pending = false
    let disposed = false
    const P = usePreview.getState

    const schedule = (ms = 250) => {
      clearTimeout(timer)
      timer = setTimeout(run, ms)
    }
    async function run() {
      if (disposed) return
      if (running) { pending = true; return }
      const hash = vfs!.currentHash()
      if (hash === P().lastHash && P().html) return
      running = true
      try {
        const engine = await getRuntime()
        if (P().status === 'idle' || P().status === 'error') usePreview.setState({ status: 'initializing', progress: { message: 'Loading compiler', pct: null } })
        await engine.init((p) => usePreview.setState({ progress: { message: p.message, pct: p.total ? Math.round(((p.loaded ?? 0) / p.total) * 100) : null } }))
        usePreview.setState({ status: 'building', progress: null })
        const res = await engine.build({ files: vfs!.textFiles(), binary: vfs!.binaryFiles() })
        if (disposed) return
        P().addLog('build', res.ok ? `Built in ${res.durationMs}ms${res.remote.length ? ` · ${res.remote.length} remote modules` : ''}${res.warnings.length ? ` · ${res.warnings.length} warnings` : ''}` : `Build failed: ${res.errors[0]?.message}`)
        logEvent('compile', res.ok ? `compiled (${res.remote.length} remote modules)` : `compile error: ${res.errors[0]?.message}`, { durationMs: res.durationMs })
        if (res.ok) usePreview.setState({ status: 'ready', html: res.html ?? null, lastHash: hash, buildErrors: [], runtimeErrors: [], warnings: res.warnings, durationMs: res.durationMs, errorDismissed: false })
        else usePreview.setState({ status: 'error', lastHash: hash, buildErrors: res.errors, durationMs: res.durationMs, errorDismissed: false })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        usePreview.setState({ status: 'error', buildErrors: [{ source: 'build', message: `Compiler failure: ${message}` }], progress: null })
        logEvent('error', `runtime engine failure: ${message}`)
      } finally {
        running = false
        if (pending) { pending = false; schedule(60) }
      }
    }
    schedule(30)
    const unsub = vfs.subscribe(() => { if (vfs.currentHash() !== P().lastHash) schedule() })
    return () => { disposed = true; clearTimeout(timer); unsub() }
  }, [vfs])
}
