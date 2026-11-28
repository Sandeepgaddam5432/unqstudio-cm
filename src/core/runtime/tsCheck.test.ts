// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { formatTsDiagnostics, summarizeTs, typeCheckFiles } from './tsCheck'

const require = createRequire(import.meta.url)
const ts = require('typescript') as typeof import('typescript')
const libDir = require.resolve('typescript/lib/lib.es5.d.ts').replace(/lib\.es5\.d\.ts$/, '')
const libs: Record<string, string> = {}
for (const f of readdirSync(libDir)) if (/^lib\..*\.d\.ts$/.test(f) && !/webworker|tsserver|typescript/.test(f)) libs[f] = readFileSync(libDir + f, 'utf8')

const check = (files: Record<string, string>) => typeCheckFiles(ts, files, libs)

describe('in-browser TypeScript checker (real semantic diagnostics)', () => {
  it('passes a clean React-style project with npm imports, @/ alias and JSX', () => {
    const d = check({
      '/src/main.tsx': `import React from 'react'\nimport { createRoot } from 'react-dom/client'\nimport App from '@/App'\ncreateRoot(document.getElementById('root')!).render(<App />)`,
      '/src/App.tsx': `import { useState } from 'react'\nimport { Button } from './Button'\nexport default function App() { const [n, setN] = useState(0); return <div className="p-4"><Button label={'n=' + n} onClick={() => setN(n + 1)} /></div> }`,
      '/src/Button.tsx': `export function Button(props: { label: string; onClick: () => void }) { return <button onClick={props.onClick}>{props.label}</button> }`,
    })
    expect(d).toEqual([])
  })
  it('reports type errors with file / line / col / code / message / severity', () => {
    const d = check({
      '/src/a.ts': `export const n: number = 'oops'\nexport function f(a: number) { return a }\nf('x', 2)\nundefinedName()`,
      '/src/b.ts': `export {}`,
    })
    const codes = d.map((x) => x.code).sort()
    expect(codes).toEqual(expect.arrayContaining([2322, 2554]))
    const first = d.find((x) => x.code === 2322)!
    expect(codes.some((c) => c === 2304 || c === 2552)).toBe(true) // undefined name (TS may add a "did you mean" suggestion)
    expect(first).toMatchObject({ file: '/src/a.ts', line: 1, col: 14, severity: 'error' })
    expect(first.message).toMatch(/not assignable to type 'number'/)
    expect(summarizeTs(d).errors).toBe(d.length)
  })
  it('checks props across virtual files and unresolved relative imports', () => {
    const d = check({
      '/src/App.tsx': `import { Button } from './Button'\nimport { Missing } from './nope'\nexport default function App() { return <Button label={42} /> }`,
      '/src/Button.tsx': `export function Button(props: { label: string }) { return <b>{props.label}</b> }`,
    })
    expect(d.some((x) => x.code === 2322 && x.file === '/src/App.tsx')).toBe(true) // label={42}
    expect(d.some((x) => x.code === 2307 && /nope/.test(x.message))).toBe(true) // relative import that does not exist IS an error
  })
  it('reports syntax errors', () => {
    const d = check({ '/src/x.ts': 'export const a = (', '/src/y.ts': 'export {}' })
    expect(d.some((x) => x.code >= 1000 && x.code < 2000 && x.file === '/src/x.ts')).toBe(true)
  })
  it('returns nothing without TS sources; formats a compact agent block', () => {
    expect(check({ '/index.html': '<div/>' })).toEqual([])
    const d = check({ '/src/a.ts': `export const n: number = 's'`, '/src/b.ts': 'export {}' })
    const text = formatTsDiagnostics(d)
    expect(text).toMatch(/^TypeScript: 1 error\(s\)\n\/src\/a\.ts:1:14 TS2322 error:/)
    expect(formatTsDiagnostics([])).toBe('TypeScript: 0 errors.')
  })
})
