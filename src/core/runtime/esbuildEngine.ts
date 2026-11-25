import type * as Esbuild from 'esbuild-wasm'
import { createCachedFetcher } from './cdnCache'
import { compileProject } from './compile'
import type { BuildInput, BuildResult, EngineProgress, Fetcher, IRuntimeEngine } from './types'

async function fetchWasm(url: string, onProgress?: (p: EngineProgress) => void): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const total = Number(res.headers.get('content-length') || 0)
  if (!res.body) return res.arrayBuffer()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress?.({ stage: 'download', loaded, total, message: 'Downloading compiler' })
  }
  const out = new Uint8Array(loaded)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out.buffer
}

export class EsbuildWasmEngine implements IRuntimeEngine {
  readonly id = 'esbuild-wasm'
  readonly name = 'esbuild-wasm (in-browser)'
  private esb: typeof Esbuild | null = null
  private initPromise: Promise<void> | null = null
  private listeners = new Set<(p: EngineProgress) => void>()
  private fetcher: Fetcher

  constructor(fetcher?: Fetcher) {
    this.fetcher = fetcher ?? createCachedFetcher()
  }

  init(onProgress?: (p: EngineProgress) => void): Promise<void> {
    if (onProgress) this.listeners.add(onProgress)
    const emit = (p: EngineProgress) => this.listeners.forEach((l) => l(p))
    this.initPromise ??= (async () => {
      emit({ stage: 'download', message: 'Loading compiler' })
      const esb = await import('esbuild-wasm')
      const local = (await import('esbuild-wasm/esbuild.wasm?url')).default
      const cdn = `https://cdn.jsdelivr.net/npm/esbuild-wasm@${esb.version}/esbuild.wasm`
      let buf: ArrayBuffer | null = null
      let lastErr: unknown
      for (const url of [local, cdn]) {
        try { buf = await fetchWasm(url, emit); break } catch (e) { lastErr = e }
      }
      if (!buf) throw new Error(`Could not load esbuild.wasm (${lastErr instanceof Error ? lastErr.message : lastErr})`)
      emit({ stage: 'compile', message: 'Compiling WebAssembly' })
      const wasmModule = await WebAssembly.compile(buf)
      await esb.initialize({ wasmModule, worker: true })
      this.esb = esb
      emit({ stage: 'ready', message: 'Compiler ready' })
    })().catch((e) => {
      this.initPromise = null
      throw e
    })
    return this.initPromise
  }

  async build(input: BuildInput): Promise<BuildResult> {
    await this.init()
    return compileProject(this.esb!, input, this.fetcher)
  }

  async dispose() {
    await this.esb?.stop?.()
    this.esb = null
    this.initPromise = null
  }
}
