import { isBareSpecifier, packageNameOf, subpathOf } from '@/lib/imports'
import type { SerializedError } from './types'

export const RESOLVE_EXTS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json', '.css']
export const ESM_ORIGIN = 'https://esm.sh'
export const DEFAULT_VERSIONS: Record<string, string> = { react: '19.1.0', 'react-dom': '19.1.0' }

export function dirname(p: string) { return p.slice(0, p.lastIndexOf('/')) || '/' }

export function joinPath(base: string, rel: string): string {
  const parts = (rel.startsWith('/') ? rel : `${base}/${rel}`).split('/')
  const out: string[] = []
  for (const s of parts) {
    if (!s || s === '.') continue
    if (s === '..') out.pop()
    else out.push(s)
  }
  return '/' + out.join('/')
}

export type SpecKind = 'relative' | 'alias' | 'absolute' | 'url' | 'bare'
export function classifySpecifier(spec: string): SpecKind {
  if (/^https?:\/\//.test(spec)) return 'url'
  if (spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..') return 'relative'
  if (spec.startsWith('@/') || spec.startsWith('~/')) return 'alias'
  if (spec.startsWith('/')) return 'absolute'
  return isBareSpecifier(spec) ? 'bare' : 'absolute'
}

/** Resolve an import against the virtual file system. Returns the absolute VFS path or null. */
export function resolveVirtual(has: (p: string) => boolean, importer: string, spec: string): string | null {
  const kind = classifySpecifier(spec)
  let base: string
  if (kind === 'alias') base = joinPath('/', '/src/' + spec.slice(2))
  else if (kind === 'absolute') base = joinPath('/', spec)
  else if (kind === 'relative') base = joinPath(dirname(importer || '/src/x'), spec)
  else return null
  const cands: string[] = [base]
  // TS-style ".js" specifiers pointing at .ts/.tsx sources
  if (/\.jsx?$/.test(base)) cands.push(base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), base.replace(/\.jsx$/, '.tsx'))
  for (const e of RESOLVE_EXTS) cands.push(base + e)
  for (const e of RESOLVE_EXTS) cands.push(`${base}/index${e}`)
  return cands.find(has) ?? null
}

export function cleanVersion(v: string | undefined): string {
  if (!v) return ''
  const t = v.trim()
  if (/^(latest|\*|next|x)$/i.test(t) || /^(workspace|file|link|git|github|npm):/.test(t) || /^[<>=]/.test(t)) return ''
  return t
}

export function readDependencyVersions(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  const raw = files['/package.json']
  if (raw) {
    try {
      const pkg = JSON.parse(raw)
      for (const group of [pkg.devDependencies, pkg.dependencies]) {
        if (group && typeof group === 'object') for (const [k, v] of Object.entries(group)) out[k] = cleanVersion(String(v))
      }
    } catch { /* invalid package.json – fall back to latest */ }
  }
  for (const [k, v] of Object.entries(DEFAULT_VERSIONS)) if (!out[k]) out[k] = v
  return out
}

/** Map a bare specifier to an esm.sh URL. React is shared via `?external` so every package sees the same copy. */
export function toEsmUrl(spec: string, versions: Record<string, string> = DEFAULT_VERSIONS): string {
  const name = packageNameOf(spec)
  const sub = subpathOf(spec)
  const v = versions[name] ?? DEFAULT_VERSIONS[name] ?? ''
  const ver = v ? `@${v}` : ''
  const ext = name === 'react' ? '' : name === 'react-dom' ? '?external=react' : '?external=react,react-dom'
  return `${ESM_ORIGIN}/${name}${ver}${sub}${ext}`
}

export function resolveRemote(spec: string, importer: string): string {
  if (/^https?:\/\//.test(spec)) return spec
  if (spec.startsWith('/')) return new URL(spec, ESM_ORIGIN).toString()
  return new URL(spec, importer).toString()
}

/** Inline relative `@import "./x.css"` rules so the preview can inject one stylesheet. */
export function inlineCssImports(path: string, css: string, read: (p: string) => string | undefined, depth = 0): string {
  if (depth > 8) return css
  return css.replace(/@import\s+(?:url\()?['"](\.{1,2}\/[^'"]+)['"]\)?\s*;?/g, (m, rel: string) => {
    const target = joinPath(dirname(path), rel)
    const src = read(target)
    return src === undefined ? m : inlineCssImports(target, src, read, depth + 1)
  })
}

export function isTailwindCss(css: string): boolean {
  return /@import\s+["']tailwindcss|@tailwind\s|@apply\s|@theme\b|@plugin\s|@source\s|@custom-variant/.test(css)
}

export function cssToJs(path: string, css: string): { js: string; tailwind: boolean } {
  const tailwind = isTailwindCss(css)
  const js =
    `const css = ${JSON.stringify(css)};\n` +
    `const el = document.createElement('style');\n` +
    `el.setAttribute('data-unq-css', ${JSON.stringify(path)});\n` +
    (tailwind ? `el.setAttribute('type', 'text/tailwindcss');\n` : '') +
    `el.textContent = css;\n(document.head || document.documentElement).appendChild(el);\nexport default css;\n`
  return { js, tailwind }
}

export function detectEntry(files: Record<string, string>): string | null {
  const html = files['/index.html']
  if (html) {
    for (const m of html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/gi)) {
      if (!/^https?:/.test(m[1])) {
        const p = joinPath('/', m[1])
        const hit = resolveVirtual((x) => x in files, '/index.html', p)
        if (hit) return hit
      }
    }
  }
  return ['/src/main.tsx', '/src/main.jsx', '/src/main.ts', '/src/main.js', '/src/index.tsx', '/src/index.jsx', '/main.tsx', '/index.tsx'].find((p) => p in files) ?? null
}

interface EsbuildMessage { text: string; location?: { file?: string; line?: number; column?: number; lineText?: string } | null; notes?: Array<{ text: string }> }

export function serializeEsbuildMessage(m: EsbuildMessage, source: 'build' = 'build'): SerializedError {
  const loc = m.location
  const file = loc?.file?.replace(/^(vfs|http):/, '')
  return {
    source,
    message: m.text,
    file,
    line: loc?.line,
    column: loc?.column,
    snippet: loc?.lineText ? `${loc.line ?? ''} | ${loc.lineText}\n${' '.repeat(String(loc.line ?? '').length + 3 + (loc.column ?? 0))}^` : undefined,
    stack: m.notes?.map((n) => n.text).join('\n') || undefined,
  }
}

export function serializeBuildError(e: unknown): SerializedError[] {
  const errs = (e as { errors?: EsbuildMessage[] } | null)?.errors
  if (Array.isArray(errs) && errs.length) return errs.map((m) => serializeEsbuildMessage(m))
  if (e instanceof Error) return [{ source: 'build', message: e.message, stack: e.stack }]
  return [{ source: 'build', message: String(e) }]
}

export function serializeRuntimeError(raw: { message?: string; file?: string; line?: number; col?: number; stack?: string }): SerializedError {
  return { source: 'runtime', message: raw.message || 'Unknown error', stack: raw.stack, file: raw.file, line: raw.line, column: raw.col }
}

/** Builds the “Fix with AI” prompt from an error + the most relevant project files. */
export function buildFixPrompt(err: SerializedError, files: Record<string, string>, maxChars = 6000): string {
  const mentioned = new Set<string>()
  const hay = `${err.file ?? ''}\n${err.stack ?? ''}\n${err.message}`
  for (const m of hay.matchAll(/(\/?src\/[\w./-]+\.(?:tsx?|jsx?|css))/g)) {
    const p = m[1].startsWith('/') ? m[1] : '/' + m[1]
    if (p in files) mentioned.add(p)
  }
  if (err.file) {
    const f = err.file.startsWith('/') ? err.file : '/' + err.file
    if (f in files) mentioned.add(f)
  }
  if (!mentioned.size && files['/src/App.tsx']) mentioned.add('/src/App.tsx')
  let ctx = ''
  for (const p of mentioned) {
    const body = files[p].slice(0, Math.max(1500, Math.floor(maxChars / mentioned.size)))
    ctx += `\n\n--- ${p} ---\n${body}`
  }
  return (
    `The live preview reported a ${err.source === 'build' ? 'build/compile' : 'runtime'} error. Please find the root cause and fix it with minimal changes.\n\n` +
    `Error: ${err.message}\n` +
    (err.file ? `Location: ${err.file}${err.line ? `:${err.line}` : ''}${err.column ? `:${err.column}` : ''}\n` : '') +
    (err.snippet ? `\n${err.snippet}\n` : '') +
    (err.stack ? `\nStack / notes:\n${err.stack.split('\n').slice(0, 8).join('\n')}\n` : '') +
    (ctx ? `\nRelevant file context:${ctx}` : '')
  )
}
