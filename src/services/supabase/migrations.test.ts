import { describe, expect, it } from 'vitest'
import { createTableSql, parseColumnSpec, projectRef, runSql } from './migrations'
import { fullstackScaffold, parseDotEnv } from './scaffold'
import { fullstackBlock } from '@/core/ai/fullstack'

describe('supabase full-stack engine', () => {
  it('generates RLS + realtime SQL from a column spec', () => {
    const sql = createTableSql('Todo Items', parseColumnSpec('title text not null, done boolean'))
    expect(sql).toContain('create table if not exists public.todo_items'); expect(sql).toContain('enable row level security'); expect(sql).toContain('auth.uid() = user_id'); expect(sql).toContain('supabase_realtime')
    expect(() => parseColumnSpec('x evil;drop')).toThrow()
  })
  it('derives the project ref and reports blocked runners helpfully', async () => {
    expect(projectRef('https://abcd1234.supabase.co/')).toBe('abcd1234')
    const r = await runSql('https://abcd1234.supabase.co', 'sbp_x', 'select 1', (() => Promise.reject(new Error('cors'))) as unknown as typeof fetch)
    expect(r.ok).toBe(false); expect(r.message).toContain('SQL editor')
    expect((await runSql('https://abcd1234.supabase.co', 'sbp_x', 'select 1', (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch)).ok).toBe(true)
  })
  it('scaffolds a typed client, env, auth + realtime hooks and a migration', () => {
    const f = fullstackScaffold({ url: 'https://abcd.supabase.co/', key: 'SECRETKEY123' })
    for (const p of ['/src/lib/supabase.ts', '/src/lib/database.types.ts', '/src/hooks/useSession.ts', '/src/hooks/useTable.ts', '/.env', '/supabase/migrations/0001_init.sql']) expect(f[p], p).toBeTruthy()
    expect(parseDotEnv(f['/.env'])).toEqual({ VITE_SUPABASE_URL: 'https://abcd.supabase.co', VITE_SUPABASE_ANON_KEY: 'SECRETKEY123' })
    expect(f['/src/lib/supabase.ts']).not.toContain('SECRETKEY123')
  })
  it('makes the agent prompt aware of the connected project', () => {
    expect(fullstackBlock({})).toBe('')
    expect(fullstackBlock({ supabase: { url: 'https://x.supabase.co', hasClient: false, hasEnv: false, tables: ['notes'] } })).toContain('notes')
  })
})
