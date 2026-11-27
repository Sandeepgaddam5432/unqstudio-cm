import type * as Esbuild from 'esbuild-wasm'
import { createPlugins } from './plugins'
import { assembleHtml } from './previewHtml'
import { detectEntry, serializeBuildError, serializeEsbuildMessage } from './resolver'
import type { BuildInput, BuildResult, Fetcher } from './types'

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Runtime-agnostic compile pipeline (shared by the browser engine and the Node-based unit tests). */
export async function compileProject(esb: typeof Esbuild, input: BuildInput, fetcher: Fetcher): Promise<BuildResult> {
  const t0 = now()
  const entry = input.entry ?? detectEntry(input.files)
  if (!entry) {
    return {
      ok: false, errors: [{ source: 'build', message: 'No entry file found. Create /src/main.tsx (or reference a module script in /index.html).' }],
      warnings: [], durationMs: 0, usesTailwind: false, remote: [],
    }
  }
  const remote = new Set<string>()
  const state = { usesTailwind: false }
  const prod = !!input.production
  try {
    const res = await esb.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      minify: prod,
      logLevel: 'silent',
      legalComments: 'none',
      define: {
        'process.env.NODE_ENV': prod ? '"production"' : '"development"',
        'import.meta.env': JSON.stringify({ ...(input.env ?? {}), MODE: prod ? 'production' : 'development', DEV: !prod, PROD: prod, BASE_URL: '/', SSR: false }),
        global: 'globalThis',
      },
      plugins: createPlugins({ files: input.files, binary: input.binary ?? {}, fetcher, remote, state }),
    })
    const js = res.outputFiles?.[0]?.text ?? ''
    const html = assembleHtml({ indexHtml: input.files['/index.html'], js, bridge: !prod, tailwind: state.usesTailwind })
    return {
      ok: true, html, js, entry, errors: [], usesTailwind: state.usesTailwind, remote: [...remote],
      warnings: res.warnings.map((w) => serializeEsbuildMessage(w)), durationMs: Math.round(now() - t0),
    }
  } catch (e) {
    return { ok: false, entry, errors: serializeBuildError(e), warnings: [], durationMs: Math.round(now() - t0), usesTailwind: state.usesTailwind, remote: [...remote] }
  }
}
