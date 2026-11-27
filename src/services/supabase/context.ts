import type { FullstackContext } from '@/core/ai/fullstack'
import { getConn, isConnected } from '@/store/connections'

/** Last schema the Database panel loaded (so the agent knows the real tables). */
let tables: string[] = []
export const rememberTables = (t: string[]) => { tables = t }

/** Snapshot of the connected Supabase project for the agent prompt (empty when not connected). */
export function supabaseContext(vfs: { has(p: string): boolean }): FullstackContext {
  if (!isConnected('supabase')) return {}
  const c = getConn('supabase')
  return { supabase: { url: c.url ?? '', hasClient: vfs.has('/src/lib/supabase.ts'), hasEnv: vfs.has('/.env'), tables } }
}
