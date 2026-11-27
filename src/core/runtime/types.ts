export type ErrorSource = 'build' | 'runtime' | 'console'

export interface SerializedError {
  source: ErrorSource
  message: string
  stack?: string
  file?: string
  line?: number
  column?: number
  /** Code frame / offending line for build errors. */
  snippet?: string
}

export interface BuildInput {
  /** utf8 files keyed by absolute VFS path. */
  files: Record<string, string>
  /** base64 binary assets keyed by absolute VFS path. */
  binary?: Record<string, string>
  entry?: string
  /** Minify and omit the dev bridge (used by deploy connectors). */
  production?: boolean
  /** Public `VITE_*` values exposed as `import.meta.env` (from the project's /.env). */
  env?: Record<string, string>
}

export interface BuildResult {
  ok: boolean
  html?: string
  js?: string
  errors: SerializedError[]
  warnings: SerializedError[]
  durationMs: number
  entry?: string
  usesTailwind: boolean
  /** Remote modules fetched during this build (esm.sh URLs). */
  remote: string[]
}

export interface EngineProgress {
  stage: 'download' | 'compile' | 'ready'
  loaded?: number
  total?: number
  message: string
}

/**
 * Port for pluggable runtimes. EsbuildWasmEngine is the default; WebContainers or a remote sandbox
 * can implement this interface and be registered with `registerRuntime()` without touching UI or AI code.
 */
export interface IRuntimeEngine {
  readonly id: string
  readonly name: string
  init(onProgress?: (p: EngineProgress) => void): Promise<void>
  build(input: BuildInput): Promise<BuildResult>
  dispose(): Promise<void>
}

export type Fetcher = (url: string) => Promise<string>
