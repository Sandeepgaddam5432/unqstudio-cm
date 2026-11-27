import { describe, expect, it } from 'vitest'
import { extractPairs, hasProtocolLeak, parseMessageText, proseOnly } from './MessageParser'

const PATCH = '<<<<<<< SEARCH\nconst a = 1\n=======\nconst a = 2\n>>>>>>> REPLACE'
describe('MessageParser — zero raw tool-call / diff leaks', () => {
  it('extracts <|tool_call|> JSON blocks into tool segments', () => {
    const t = 'Sure!\n<|tool_call:start|>{"name":"create_file","arguments":{"path":"/src/a.ts","content":"export {}"}}<|tool_call:end|>\nDone.'
    const s = parseMessageText(t)
    expect(s.map((x) => x.kind)).toEqual(['prose', 'tool', 'prose'])
    expect(s[1]).toMatchObject({ tool: 'Create', path: '/src/a.ts', done: true })
    expect(hasProtocolLeak(proseOnly(t))).toBe(false)
  })
  it('turns patch_file XML and bare SEARCH/REPLACE into Patch cards with pairs', () => {
    const t = `Fixing.\n<patch_file path="/src/App.tsx">\n${PATCH}\n</patch_file>\nAll set.`
    const s = parseMessageText(t)
    expect(s[1]).toMatchObject({ kind: 'tool', tool: 'Patch', path: '/src/App.tsx' })
    expect((s[1] as { pairs: unknown[] }).pairs).toEqual([{ search: 'const a = 1', replace: 'const a = 2' }])
    const bare = parseMessageText(`Here:\n${PATCH}\nok`)
    expect(bare.some((x) => x.kind === 'tool' && x.tool === 'Patch')).toBe(true)
    expect(hasProtocolLeak(proseOnly(`Here:\n${PATCH}\nok`))).toBe(false)
  })
  it('handles fenced diffs and stray closers', () => {
    const t = 'Look:\n```diff\n' + PATCH + '\n```\n</patch_file>\nbye'
    expect(hasProtocolLeak(proseOnly(t))).toBe(false)
    expect(proseOnly(t)).toContain('bye')
  })
  it('swallows unterminated blocks and partial tags while streaming', () => {
    expect(proseOnly('Working <|tool_ca', true)).toBe('Working')
    expect(proseOnly('Working <patch_fi', true)).toBe('Working')
    const open = parseMessageText('Go\n<patch_file path="/a.ts">\n<<<<<<< SEARCH\nfoo\n=======\nba', true)
    expect(open[1]).toMatchObject({ tool: 'Patch', done: false })
    expect(hasProtocolLeak(proseOnly('Go\n<<<<<<< SEARCH\nfoo\n=====', true))).toBe(false)
  })
  it('keeps normal markdown prose untouched', () => {
    const t = '# Title\n\n- a < b\n- `code`\n\nx <div> y'
    expect(proseOnly(t)).toBe(t)
  })
  it('extracts multiple pairs', () => { expect(extractPairs(`${PATCH}\n${PATCH}`)).toHaveLength(2) })
})
