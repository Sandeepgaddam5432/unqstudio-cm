import type { Plugin, Loader } from 'esbuild-wasm'
import { classifySpecifier, cssToJs, inlineCssImports, readDependencyVersions, resolveRemote, resolveVirtual, toEsmUrl } from './resolver'
import type { Fetcher } from './types'

export interface PluginContext {
  files: Record<string, string>
  binary: Record<string, string>
  fetcher: Fetcher
  remote: Set<string>
  state: { usesTailwind: boolean }
}

const LOADERS: Record<string, Loader> = { '.ts': 'ts', '.tsx': 'tsx', '.js': 'js', '.jsx': 'jsx', '.mjs': 'js', '.json': 'json', '.txt': 'text' }
const ASSET = /\.(png|jpe?g|gif|webp|avif|ico|bmp|svg|woff2?|ttf|otf|eot|mp3|mp4|webm|wav)$/i

function b64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'))
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** esbuild plugin set: virtual file system namespace ("vfs") + remote https modules via esm.sh ("http"). */
export function createPlugins(ctx: PluginContext): Plugin[] {
  const versions = readDependencyVersions(ctx.files)
  const has = (p: string) => p in ctx.files || p in ctx.binary
  const read = (p: string) => ctx.files[p]

  const virtual: Plugin = {
    name: 'unq-vfs',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        const spec = args.path
        const kind = classifySpecifier(spec)
        const inHttp = args.namespace === 'http'

        if (args.kind === 'entry-point') return { path: spec.startsWith('/') ? spec : '/' + spec, namespace: 'vfs' }
        if (kind === 'url') return { path: spec, namespace: 'http' }
        if (inHttp) {
          if (kind === 'bare') return { path: toEsmUrl(spec, versions), namespace: 'http' }
          return { path: resolveRemote(spec, args.importer), namespace: 'http' }
        }
        if (kind === 'bare') return { path: toEsmUrl(spec, versions), namespace: 'http' }
        const hit = resolveVirtual(has, args.importer, spec)
        if (!hit) {
          return {
            errors: [{ text: `Could not resolve "${spec}" from ${args.importer || 'entry'}. Create the file or install the package via an import.`, location: null }],
          }
        }
        return { path: hit, namespace: 'vfs' }
      })

      build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args) => {
        const path = args.path
        const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
        if (ext === '.css') {
          const css = inlineCssImports(path, ctx.files[path] ?? '', read)
          const { js, tailwind } = cssToJs(path, css)
          if (tailwind) ctx.state.usesTailwind = true
          return { contents: js, loader: 'js' }
        }
        if (ASSET.test(path)) {
          if (path in ctx.binary) return { contents: b64ToBytes(ctx.binary[path]), loader: 'dataurl' }
          if (path in ctx.files) return { contents: ctx.files[path], loader: 'dataurl' }
        }
        const text = ctx.files[path]
        if (text === undefined) return { errors: [{ text: `File not found in project: ${path}` }] }
        return { contents: text, loader: LOADERS[ext] ?? 'text', resolveDir: '/' }
      })

      build.onLoad({ filter: /.*/, namespace: 'http' }, async (args) => {
        try {
          ctx.remote.add(args.path)
          const text = await ctx.fetcher(args.path)
          if (/\.css(\?|$)/.test(args.path)) {
            const { js, tailwind } = cssToJs(args.path, text)
            if (tailwind) ctx.state.usesTailwind = true
            return { contents: js, loader: 'js' }
          }
          return { contents: text, loader: 'js' }
        } catch (e) {
          return { errors: [{ text: e instanceof Error ? e.message : String(e) }] }
        }
      })
    },
  }
  return [virtual]
}
