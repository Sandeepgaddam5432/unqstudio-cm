// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import * as esbuild from 'esbuild-wasm'
import { BUILTIN_TEMPLATES } from './index'
import { compileProject } from '@/core/runtime/compile'
import { collectImports, isBareSpecifier, packageNameOf } from '@/lib/imports'

/** Stub CDN: every named import found anywhere in the template is exported by a generated stub module. */
function stubFetcher(files: Record<string, string>) {
  const names = new Map<string, Set<string>>()
  for (const [p, c] of Object.entries(files)) {
    if (!/\.(tsx?|jsx?)$/.test(p)) continue
    for (const m of c.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
      if (!isBareSpecifier(m[2])) continue
      const pkg = m[2]
      const set = names.get(pkg) ?? new Set<string>()
      for (const n of m[1].split(',')) { const nm = n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]; if (nm) set.add(nm) }
      names.set(pkg, set)
    }
  }
  return async (url: string) => {
    const u = new URL(url)
    const spec = u.pathname.slice(1).replace(/^(@[^/@]+\/[^/@]+|[^/@]+)@[^/]*/, '$1') // keeps @scope/pkg, drops @version
    const exp = [...(names.get(spec) ?? [])].map((n) => `export const ${n} = (p) => p;`).join('\n')
    if (spec.startsWith('react/jsx-runtime')) return 'export const jsx = () => null; export const jsxs = jsx; export const Fragment = null;'
    if (spec === 'react-dom/client') return 'export const createRoot = () => ({ render() {} });'
    return exp + '\nexport default {};'
  }
}

let esbReady: Promise<void> | null = null
const initEsbuild = () => (esbReady ??= esbuild.initialize({}))

describe('built-in templates', () => {
  it('ships 9 uniquely identified templates with runnable scaffolding', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(9)
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.id)).size).toBe(9)
    for (const t of BUILTIN_TEMPLATES) {
      for (const p of ['/package.json', '/index.html', '/src/main.tsx', '/src/App.tsx', '/src/index.css', '/vite.config.ts']) expect(t.files[p], `${t.id} ${p}`).toBeTruthy()
      expect(t.files['/src/index.css']).toContain('unq-theme:start')
      expect(() => JSON.parse(t.files['/package.json'])).not.toThrow()
    }
  })

  it('every local import resolves and package.json declares every npm import', () => {
    for (const t of BUILTIN_TEMPLATES) {
      const pkg = JSON.parse(t.files['/package.json'])
      for (const [p, c] of Object.entries(t.files)) {
        if (!/\.(tsx?)$/.test(p) || p.endsWith('vite.config.ts')) continue
        for (const spec of collectImports(c)) {
          if (isBareSpecifier(spec)) expect(pkg.dependencies[packageNameOf(spec)] ?? pkg.devDependencies[packageNameOf(spec)], `${t.id}: ${spec}`).toBeTruthy()
        }
      }
    }
  })

  for (const t of BUILTIN_TEMPLATES) {
    it(`compiles with esbuild: ${t.id}`, async () => {
      await initEsbuild()
      const res = await compileProject(esbuild, { files: t.files }, stubFetcher(t.files))
      expect(res.errors.map((e) => `${e.file}:${e.line} ${e.message}`)).toEqual([])
      expect(res.ok).toBe(true)
      expect(res.usesTailwind).toBe(true)
    })
  }

  it('type-checks (tsc --strict) against real React + lucide-react typings', () => {
    const root = join(tmpdir(), 'unq-tpl-' + Date.now())
    const nm = resolve(__dirname, '../../node_modules')
    for (const t of BUILTIN_TEMPLATES) {
      const dir = join(root, t.id)
      for (const [p, c] of Object.entries(t.files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), c) }
      symlinkSync(nm, join(dir, 'node_modules'))
    }
    const bin = join(nm, 'typescript/bin/tsc')
    const failures: string[] = []
    for (const t of BUILTIN_TEMPLATES) {
      try { execFileSync('node', [bin, '--noEmit', '-p', join(root, t.id, 'tsconfig.json'), '--pretty', 'false'], { stdio: 'pipe' }) } catch (e) { failures.push(t.id + ':\n' + String((e as { stdout?: Buffer }).stdout)) }
    }
    rmSync(root, { recursive: true, force: true })
    expect(failures).toEqual([])
  }, 180_000)
})
