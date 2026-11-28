// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { addDependency, buildSearchUrl, esmWarmUrl, parseSearchResponse, removeDependency, searchNpm } from './npmSearch'
import { a11yFixture } from './a11yChecks.test'

const sample = { objects: [{ package: { name: 'zustand', version: '5.0.2', description: 'bear necessities', publisher: { username: 'dai-shi' }, date: '2025-01-01', links: { npm: 'https://npm/zustand' } } }, { package: { name: 5 } }, {}] }
describe('npm search & installer', () => {
  it('builds a safe registry URL and parses results, skipping malformed entries', () => {
    expect(buildSearchUrl(' react query ', 99)).toBe('https://registry.npmjs.org/-/v1/search?text=react%20query&size=25')
    expect(parseSearchResponse(sample)).toEqual([{ name: 'zustand', version: '5.0.2', description: 'bear necessities', author: 'dai-shi', date: '2025-01-01', homepage: 'https://npm/zustand' }])
    expect(parseSearchResponse(null)).toEqual([])
  })
  it('searchNpm debounces short queries, throws on HTTP errors', async () => {
    let calls = 0
    const ok = (async () => { calls++; return new Response(JSON.stringify(sample)) }) as unknown as typeof fetch
    expect(await searchNpm('a', ok)).toEqual([]); expect(calls).toBe(0)
    expect((await searchNpm('zustand', ok))[0].name).toBe('zustand')
    await expect(searchNpm('zustand', (async () => new Response('x', { status: 503 })) as unknown as typeof fetch)).rejects.toThrow(/HTTP 503/)
  })
  it('adds / removes dependencies keeping sorted JSON and rejecting bad names', () => {
    const j = addDependency('{"name":"x","dependencies":{"react":"^19.0.0"}}', 'zustand', '5.0.2')
    expect(JSON.parse(j).dependencies).toEqual({ react: '^19.0.0', zustand: '^5.0.2' })
    expect(Object.keys(JSON.parse(addDependency(j, '@tanstack/react-query', '^5.0.0', true)).devDependencies)).toEqual(['@tanstack/react-query'])
    expect(JSON.parse(removeDependency(j, 'react')).dependencies).toEqual({ zustand: '^5.0.2' })
    expect(() => addDependency('{}', 'Bad Name!', '1.0.0')).toThrow(/Invalid package name/)
    expect(esmWarmUrl('zustand', '^5.0.2')).toBe('https://esm.sh/zustand@5.0.2')
  })
  it('shares fixtures with the a11y tests', () => { expect(a11yFixture).toBe(true) })
})
