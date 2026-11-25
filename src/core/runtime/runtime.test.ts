// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as esbuild from 'esbuild-wasm'
import {
  buildFixPrompt, classifySpecifier, cleanVersion, cssToJs, detectEntry, inlineCssImports, readDependencyVersions, resolveRemote,
  resolveVirtual, serializeBuildError, serializeRuntimeError, toEsmUrl,
} from './resolver'
import { compileProject } from './compile'
import { assembleHtml, escapeInlineScript, popoutWrapper } from './previewHtml'
import { BRIDGE_SCRIPT } from './bridgeScript'

const files = {
  '/src/main.tsx': "import './index.css'", '/src/App.tsx': '', '/src/components/Button.tsx': '', '/src/lib/index.ts': '',
  '/src/data.json': '{}', '/src/styles/a.css': '',
}
const has = (p: string) => p in files

describe('virtual resolver', () => {
  it('resolves relative, alias, absolute and index imports with extension probing', () => {
    expect(resolveVirtual(has, '/src/main.tsx', './App')).toBe('/src/App.tsx')
    expect(resolveVirtual(has, '/src/components/Button.tsx', '../App')).toBe('/src/App.tsx')
    expect(resolveVirtual(has, '/src/main.tsx', '@/components/Button')).toBe('/src/components/Button.tsx')
    expect(resolveVirtual(has, '/src/main.tsx', '/src/lib')).toBe('/src/lib/index.ts')
    expect(resolveVirtual(has, '/src/main.tsx', './data.json')).toBe('/src/data.json')
    expect(resolveVirtual(has, '/src/main.tsx', './styles/a.css')).toBe('/src/styles/a.css')
    expect(resolveVirtual(has, '/src/main.tsx', './lib/index.js')).toBe('/src/lib/index.ts')
    expect(resolveVirtual(has, '/src/main.tsx', './missing')).toBeNull()
  })
  it('classifies specifiers', () => {
    expect(classifySpecifier('react')).toBe('bare')
    expect(classifySpecifier('@radix-ui/react-dialog')).toBe('bare')
    expect(classifySpecifier('@/x')).toBe('alias')
    expect(classifySpecifier('./x')).toBe('relative')
    expect(classifySpecifier('https://esm.sh/x')).toBe('url')
  })
})

describe('import mapping (esm.sh)', () => {
  it('maps bare imports with shared react and package.json versions', () => {
    const v = readDependencyVersions({ '/package.json': JSON.stringify({ dependencies: { 'lucide-react': '^0.469.0', 'framer-motion': 'latest', react: '^19.0.0' } }) })
    expect(toEsmUrl('lucide-react', v)).toBe('https://esm.sh/lucide-react@^0.469.0?external=react,react-dom')
    expect(toEsmUrl('framer-motion', v)).toBe('https://esm.sh/framer-motion?external=react,react-dom')
    expect(toEsmUrl('react/jsx-runtime', v)).toBe('https://esm.sh/react@^19.0.0/jsx-runtime')
    expect(toEsmUrl('react-dom/client', v)).toBe('https://esm.sh/react-dom@19.1.0/client?external=react')
    expect(toEsmUrl('@radix-ui/react-dialog/foo')).toBe('https://esm.sh/@radix-ui/react-dialog/foo?external=react,react-dom')
    expect(cleanVersion('workspace:*')).toBe('')
    expect(resolveRemote('/react@19.1.0/es2022/react.mjs', 'https://esm.sh/x')).toBe('https://esm.sh/react@19.1.0/es2022/react.mjs')
    expect(resolveRemote('./b.js', 'https://esm.sh/a/index.js')).toBe('https://esm.sh/a/b.js')
  })
  it('detects entry points from index.html', () => {
    expect(detectEntry({ '/index.html': '<script type="module" src="/src/boot.tsx"></script>', '/src/boot.tsx': '' })).toBe('/src/boot.tsx')
    expect(detectEntry({ '/src/main.tsx': '' })).toBe('/src/main.tsx')
    expect(detectEntry({})).toBeNull()
  })
})

describe('css handling', () => {
  it('inlines relative @import and flags tailwind', () => {
    const out = inlineCssImports('/src/index.css', '@import "./styles/a.css";\nbody{}', (p) => (p === '/src/styles/a.css' ? '.a{}' : undefined))
    expect(out).toContain('.a{}')
    expect(cssToJs('/a.css', '@import "tailwindcss";').tailwind).toBe(true)
    const plain = cssToJs('/a.css', 'body{color:red}')
    expect(plain.tailwind).toBe(false)
    expect(plain.js).toContain('createElement')
  })
})

describe('error serialization', () => {
  it('serializes esbuild failures and runtime errors', () => {
    const [e] = serializeBuildError({ errors: [{ text: 'Unexpected "}"', location: { file: 'vfs:/src/App.tsx', line: 3, column: 4, lineText: 'return }' } }] })
    expect(e).toMatchObject({ source: 'build', message: 'Unexpected "}"', file: '/src/App.tsx', line: 3, column: 4 })
    expect(e.snippet).toContain('return }')
    expect(serializeBuildError(new Error('boom'))[0].message).toBe('boom')
    expect(serializeRuntimeError({ message: 'x is not defined', file: 'a', line: 1, col: 2 })).toMatchObject({ source: 'runtime', line: 1, column: 2 })
  })
  it('builds a fix prompt with file context', () => {
    const prompt = buildFixPrompt({ source: 'build', message: 'Oops', file: '/src/App.tsx', line: 2 }, { '/src/App.tsx': 'export default function App(){}' })
    expect(prompt).toContain('Oops')
    expect(prompt).toContain('--- /src/App.tsx ---')
    expect(prompt).toContain('export default function App')
  })
})

describe('preview html', () => {
  it('inlines the bundle, removes entry script, injects bridge + tailwind', () => {
    const html = assembleHtml({ indexHtml: '<html><head><title>t</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>', js: 'console.log("</script>")', bridge: true, tailwind: true })
    expect(html).not.toContain('src="/src/main.tsx"')
    expect(html).toContain('@tailwindcss/browser')
    expect(html).toContain('__unq')
    expect(html).toContain('<\\/script>')
    expect(html.indexOf('__unq')).toBeLessThan(html.indexOf('type="module"'))
    expect(escapeInlineScript('</SCRIPT>')).toBe('<\\/script>')
  })
  it('production html has no bridge', () => {
    expect(assembleHtml({ js: '1', bridge: false, tailwind: false })).not.toContain('__unq')
  })
  it('bridge script is syntactically valid JS and the popout wrapper sandboxes the srcdoc', () => {
    expect(() => new Function(BRIDGE_SCRIPT)).not.toThrow()
    expect(popoutWrapper('<p a="b">&</p>')).toContain('sandbox="allow-scripts')
    expect(popoutWrapper('<p a="b">&</p>')).toContain('&quot;b&quot;')
  })
})

describe('esbuild-wasm pipeline (real compile, mocked network)', () => {
  const fetched: string[] = []
  const fetcher = async (url: string) => {
    fetched.push(url)
    if (url.startsWith('https://esm.sh/tiny-lib')) return 'import { v } from "/tiny-dep@1.0.0/index.js"; export const hello = () => "hello " + v;'
    if (url === 'https://esm.sh/tiny-dep@1.0.0/index.js') return 'export const v = "dep";'
    if (url.includes('react@19.1.0/jsx-runtime')) return 'export const jsx = () => null; export const jsxs = jsx; export const Fragment = null;'
    throw new Error('Failed to fetch ' + url + ' (404)')
  }
  const project = {
    '/index.html': '<html><head></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    '/package.json': JSON.stringify({ dependencies: { 'tiny-lib': '1.2.3' } }),
    '/src/main.tsx': "import './index.css'\nimport { hello } from 'tiny-lib'\nimport { Card } from '@/components/Card'\nimport data from './data.json'\ndocument.title = hello() + data.n\nconsole.log(Card())",
    '/src/index.css': '@import "tailwindcss";\n.x{color:red}',
    '/src/components/Card.tsx': 'export const Card = () => <div className="p-4">card</div>',
    '/src/data.json': '{"n": 7}',
  }
  it('compiles TSX + CSS + JSON + remote packages into a runnable html document', async () => {
    await esbuild.initialize({})
    const res = await compileProject(esbuild, { files: project }, fetcher)
    expect(res.errors).toEqual([])
    expect(res.ok).toBe(true)
    expect(res.usesTailwind).toBe(true)
    expect(res.html).toContain('@tailwindcss/browser')
    expect(res.js).toContain('text/tailwindcss')
    expect(res.js).toContain('hello ')
    expect(res.js).toContain('jsx-runtime')
    expect(fetched).toContain('https://esm.sh/tiny-lib@1.2.3?external=react,react-dom')
    expect(fetched).toContain('https://esm.sh/tiny-dep@1.0.0/index.js')
  })
  it('reports compile errors with locations instead of throwing', async () => {
    const res = await compileProject(esbuild, { files: { ...project, '/src/components/Card.tsx': 'export const Card = () => <div>' } }, fetcher)
    expect(res.ok).toBe(false)
    expect(res.errors[0].file).toBe('/src/components/Card.tsx')
    expect(res.errors[0].line).toBe(1)
  })
  it('reports unresolved imports and network failures', async () => {
    const r1 = await compileProject(esbuild, { files: { ...project, '/src/main.tsx': "import './nope'" } }, fetcher)
    expect(r1.ok).toBe(false)
    expect(r1.errors[0].message).toContain('Could not resolve "./nope"')
    const r2 = await compileProject(esbuild, { files: { ...project, '/src/main.tsx': "import 'missing-pkg'" } }, fetcher)
    expect(r2.ok).toBe(false)
    expect(r2.errors[0].message).toContain('404')
  })
  it('reports a missing entry and supports production minification', async () => {
    expect((await compileProject(esbuild, { files: {} }, fetcher)).errors[0].message).toContain('No entry file')
    const prod = await compileProject(esbuild, { files: project, production: true }, fetcher)
    expect(prod.ok).toBe(true)
    expect(prod.html).not.toContain('__unq')
  })
})
