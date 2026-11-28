/**
 * Real TypeScript semantic + syntactic diagnostics over the virtual project (a `tsc --noEmit` equivalent), independent of
 * where it runs: the lazy Web Worker (`typecheckWorker.ts`) in the browser, plain Node in unit tests.
 *
 * esbuild-wasm only *strips* types; this actually checks them. npm packages are not installed in the VFS, so unresolved
 * bare imports are declared as `any` (shorthand ambient module) instead of drowning the agent in "Cannot find module"
 * noise; relative / `@/` imports resolve against the virtual files and ARE fully checked, as are project-local props,
 * call signatures, undefined names, wrong argument counts, etc.
 */
import type * as TS from 'typescript'

export interface TsDiagnostic { file: string; line: number; col: number; code: number; message: string; severity: 'error' | 'warning' | 'suggestion' }

const AMBIENT_BASE = `
declare namespace JSX { interface IntrinsicElements { [name: string]: any } interface IntrinsicAttributes { key?: any } interface ElementChildrenAttribute { children: {} } interface Element {} }
interface ImportMeta { readonly env: Record<string, string | undefined>; readonly hot?: any }
declare module '*.css'; declare module '*.svg'; declare module '*.png'; declare module '*.jpg'; declare module '*.json';
`
/** `declare module 'pkg'` for every bare specifier in use — relative / `@/` imports stay strictly resolved (a missing ./file IS an error). */
function ambientFor(files: Record<string, string>): string {
  const bare = new Set<string>(['react/jsx-runtime'])
  for (const [p, c] of Object.entries(files)) {
    if (!/\.(tsx?|jsx?|mts|cts)$/.test(p)) continue
    for (const m of c.matchAll(/(?:from|import|require\()\s*\(?\s*['"]([^'"]+)['"]/g)) { const s = m[1]; if (!/^(\.|\/|@\/)/.test(s) && !/\.(css|svg|png|jpe?g|json)$/.test(s)) bare.add(s) }
  }
  return AMBIENT_BASE + [...bare].map((m) => `declare module ${JSON.stringify(m)};`).join('\n')
}
const AMBIENT_PATH = '/__unq_ambient.d.ts'
const LIB_DIR = '/__lib/'
export const TS_CHECK_EXTS = /\.(tsx?|mts|cts)$/

export function typeCheckFiles(ts: typeof TS, files: Record<string, string>, libs: Record<string, string>, opts: { maxDiagnostics?: number } = {}): TsDiagnostic[] {
  const sources = new Map<string, string>()
  for (const [p, c] of Object.entries(files)) if (/\.(tsx?|mts|cts|jsx?)$/.test(p) || p.endsWith('.d.ts')) sources.set(p, c)
  sources.set(AMBIENT_PATH, ambientFor(files))
  const roots = [...sources.keys()].filter((p) => TS_CHECK_EXTS.test(p) || p === AMBIENT_PATH)
  if (roots.length <= 1) return []
  const options: TS.CompilerOptions = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX,
    strict: true, noEmit: true, skipLibCheck: true, allowJs: false, isolatedModules: true, resolveJsonModule: true, esModuleInterop: true,
    baseUrl: '/', paths: { '@/*': ['/src/*'] }, lib: ['lib.es2022.full.d.ts'], types: [], noUnusedLocals: false,
  }
  const readLib = (name: string) => libs[name.replace(LIB_DIR, '')]
  const host: TS.CompilerHost = {
    getSourceFile: (f, lang) => { const t = f.startsWith(LIB_DIR) ? readLib(f) : sources.get(f); return t === undefined ? undefined : ts.createSourceFile(f, t, lang, true) },
    getDefaultLibFileName: () => `${LIB_DIR}lib.es2022.full.d.ts`,
    getDefaultLibLocation: () => LIB_DIR.slice(0, -1),
    writeFile: () => {}, getCurrentDirectory: () => '/', getDirectories: () => [],
    fileExists: (f) => (f.startsWith(LIB_DIR) ? readLib(f) !== undefined : sources.has(f)),
    readFile: (f) => (f.startsWith(LIB_DIR) ? readLib(f) : sources.get(f)),
    getCanonicalFileName: (f) => f, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    directoryExists: (d) => d === '/' || d === LIB_DIR.slice(0, -1) || [...sources.keys()].some((k) => k.startsWith(d.endsWith('/') ? d : d + '/')),
    realpath: (f) => f,
  }
  const program = ts.createProgram({ rootNames: roots, options, host })
  const out: TsDiagnostic[] = []
  for (const sf of program.getSourceFiles()) {
    if (sf.fileName.startsWith(LIB_DIR) || sf.fileName === AMBIENT_PATH) continue
    const diags = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]
    for (const d of diags) {
      const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : { line: 0, character: 0 }
      out.push({
        file: sf.fileName, line: pos.line + 1, col: pos.character + 1, code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        severity: d.category === ts.DiagnosticCategory.Error ? 'error' : d.category === ts.DiagnosticCategory.Warning ? 'warning' : 'suggestion',
      })
      if (out.length >= (opts.maxDiagnostics ?? 200)) return out
    }
  }
  return out
}

export const summarizeTs = (d: TsDiagnostic[]) => ({ errors: d.filter((x) => x.severity === 'error').length, warnings: d.filter((x) => x.severity === 'warning').length })

/** Agent-facing text block (`path:line:col TS1234 message`). */
export function formatTsDiagnostics(d: TsDiagnostic[], limit = 20): string {
  if (!d.length) return 'TypeScript: 0 errors.'
  const lines = d.slice(0, limit).map((x) => `${x.file}:${x.line}:${x.col} TS${x.code} ${x.severity}: ${x.message.split('\n')[0]}`)
  return `TypeScript: ${summarizeTs(d).errors} error(s)\n${lines.join('\n')}${d.length > limit ? `\n… ${d.length - limit} more` : ''}`
}
