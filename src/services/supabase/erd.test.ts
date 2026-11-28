// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generateSeedSql, generateSql, isDestructiveSql, migrationPath, topoOrder, validateModel, type SchemaModel } from './erd'

const model: SchemaModel = {
  tables: [
    { name: 'posts', rls: 'owner', realtime: true, columns: [
      { name: 'id', type: 'uuid', pk: true }, { name: 'user_id', type: 'uuid', notNull: true }, { name: 'profile_id', type: 'uuid', references: { table: 'profiles', column: 'id' } },
      { name: 'title', type: 'text', notNull: true }, { name: 'price', type: 'numeric' }, { name: 'published', type: 'bool', default: 'false' }, { name: 'created_at', type: 'timestamptz', default: 'now()' },
    ] },
    { name: 'profiles', rls: 'owner', columns: [{ name: 'id', type: 'uuid', pk: true }, { name: 'user_id', type: 'uuid', notNull: true }, { name: 'display_name', type: 'text' }, { name: 'email', type: 'text', unique: true }] },
  ],
}
describe('schema designer SQL', () => {
  it('orders tables by FK dependency and generates tables, FKs, RLS owner policies and Realtime', () => {
    expect(topoOrder(model).map((t) => t.name)).toEqual(['profiles', 'posts'])
    const sql = generateSql(model)
    expect(sql.indexOf('"profiles"')).toBeLessThan(sql.indexOf('create table if not exists public."posts"'))
    expect(sql).toContain('"profile_id" uuid references "profiles"("id") on delete cascade')
    expect(sql).toContain('"id" uuid not null default gen_random_uuid()')
    expect(sql).toContain('"email" text unique')
    expect(sql.match(/create policy/g)).toHaveLength(8)
    expect(sql).toContain('create policy "posts_owner_select" on public."posts" for select to authenticated using (auth.uid() = "user_id");')
    expect(sql).toContain('alter publication supabase_realtime add table public."posts";')
    expect(sql).not.toContain('add table public."profiles"')
  })
  it('validates and refuses unsafe identifiers / missing keys / dangling references', () => {
    const bad: SchemaModel = { tables: [{ name: 'x; drop table y', columns: [{ name: 'id', type: 'uuid', pk: true }] }, { name: 'nopk', columns: [{ name: 'a', type: 'text' }] }, { name: 'r', columns: [{ name: 'id', type: 'uuid', pk: true }, { name: 'z', type: 'uuid', references: { table: 'ghost', column: 'id' } }, { name: 'w', type: 'varchar' }] }] }
    const errs = validateModel(bad)
    expect(errs.join('|')).toMatch(/invalid name/)
    expect(errs.join('|')).toMatch(/no primary key/)
    expect(errs.join('|')).toMatch(/references missing ghost\.id/)
    expect(errs.join('|')).toMatch(/unsupported type "varchar"/)
    expect(() => generateSql(bad)).toThrow(/invalid name/)
  })
  it('generates deterministic, realistic, FK-consistent seed SQL', () => {
    const seed = generateSeedSql(model, 3)
    expect(seed).toBe(generateSeedSql(model, 3))
    expect(seed.indexOf('insert into public."profiles"')).toBeLessThan(seed.indexOf('insert into public."posts"'))
    expect(seed).toContain("'ava0@example.com'")
    expect(seed).toContain("'Ava Chen'")
    expect(seed).toContain("'00000000-0000-4000-8000-000100000001'") // posts.profile_id → profile #1 (seeded id)
    expect(seed.match(/on conflict \("id"\) do nothing;/g)).toHaveLength(2)
    expect(seed).toMatch(/\(\s*'00000000-0000-4000-8000-0002/) // posts ids
  })
  it('names migrations and detects destructive SQL for the permission gate', () => {
    expect(migrationPath(3, 'Add Posts & Profiles!')).toBe('/supabase/migrations/0003_add_posts_profiles.sql')
    expect([isDestructiveSql('DROP TABLE x'), isDestructiveSql('truncate foo'), isDestructiveSql('delete from t'), isDestructiveSql('delete from t where id = 1'), isDestructiveSql('select 1'), isDestructiveSql('-- drop table x')]).toEqual([true, true, true, false, false, false])
  })
})
