import { describe, expect, it } from 'vitest'
import { fuzzyScore } from './fuzzy'
import { collectBareImports, isBareSpecifier, packageNameOf } from './imports'
import { PROVIDERS } from '@/core/ai/providers'
import { ensureScaffold, scaffoldFiles } from '@/core/vfs/scaffold'
import { timeAgo, slugify } from './util'

describe('fuzzy', () => {
  it('matches subsequences and ranks better matches first', () => {
    expect(fuzzyScore('xyz', 'abc')).toBe(-1)
    expect(fuzzyScore('app', 'src/App.tsx')).toBeGreaterThan(fuzzyScore('app', 'src/components/shapes/p.tsx'))
    expect(fuzzyScore('', 'anything')).toBe(0)
  })
})

describe('imports', () => {
  it('classifies and extracts bare imports', () => {
    expect(isBareSpecifier('react')).toBe(true)
    expect(isBareSpecifier('./a')).toBe(false)
    expect(isBareSpecifier('@/lib/x')).toBe(false)
    expect(isBareSpecifier('@radix-ui/react-dialog')).toBe(true)
    expect(packageNameOf('lodash/fp/get')).toBe('lodash')
    expect(packageNameOf('@radix-ui/react-dialog/dist')).toBe('@radix-ui/react-dialog')
    const src = `import a from 'react'; import { x } from "lucide-react"; import './x.css'; const m = await import('date-fns/format'); export * from '@/foo'`
    expect(collectBareImports(src).sort()).toEqual(['date-fns', 'lucide-react', 'react'])
  })
})

describe('providers', () => {
  it('ships 20 providers with unique ids', () => {
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(20)
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length)
    expect(PROVIDERS.find((p) => p.id === 'ollama')?.baseUrl).toContain('11434')
    expect(PROVIDERS.find((p) => p.id === 'lmstudio')?.baseUrl).toContain('1234')
  })
})

describe('scaffold', () => {
  it('produces a runnable vite project and adds missing deps', () => {
    const f = scaffoldFiles('My App')
    for (const p of ['/package.json', '/vite.config.ts', '/index.html', '/src/main.tsx', '/tsconfig.json']) expect(f[p]).toBeTruthy()
    const out = ensureScaffold({ '/src/App.tsx': "import { motion } from 'framer-motion'\nexport default () => null" }, 'My App')
    expect(JSON.parse(out['/package.json']).dependencies['framer-motion']).toBe('latest')
    expect(out['/index.html']).toContain('<div id="root">')
  })
})

describe('util', () => {
  it('formats', () => {
    expect(slugify('Hello World!')).toBe('hello-world')
    expect(timeAgo(Date.now() - 3 * 3600_000)).toBe('3h ago')
  })
})
