/**
 * Full-stack awareness for the agent (v3.2). A plain module (like userContext) so `prompts.ts` never imports from `store/`.
 * The chat store pushes the connected Supabase project here before each build turn.
 */
export interface FullstackContext { supabase?: { url: string; hasClient: boolean; hasEnv: boolean; tables: string[] } }
let ctx: FullstackContext = {}
export const setFullstackContext = (c: FullstackContext) => { ctx = c }
export const getFullstackContext = () => ctx

export const FULLSTACK_RULES = `## Full-stack apps (Supabase)
You can build REAL full-stack apps, not just static sites: Postgres + Auth + Realtime through Supabase, called from the browser.
- Use the typed client in \`/src/lib/supabase.ts\` (\`import { supabase, isSupabaseConfigured } from '@/lib/supabase'\`). NEVER hard-code keys; read \`import.meta.env.VITE_SUPABASE_URL\` / \`VITE_SUPABASE_ANON_KEY\` (they come from \`/.env\` and are injected into the live preview).
- Auth: \`supabase.auth.signUp / signInWithPassword / signOut / onAuthStateChange\`; gate screens behind the session; show a friendly sign-in form.
- CRUD + Realtime: \`supabase.from('table').select/insert/update/delete\` and \`supabase.channel(...).on('postgres_changes', …)\`. Update the UI optimistically and handle errors.
- Whenever you introduce or change tables, ALSO create a SQL migration at \`/supabase/migrations/NNNN_name.sql\` (create table, enable Row Level Security, owner policies using \`auth.uid()\`, \`alter publication supabase_realtime add table …\`) and tell the user to run it from the Database panel.
- Never use or expose a service_role key in browser code.`

/** Dynamic block describing the connected project ('' when none). */
export function fullstackBlock(c: FullstackContext = ctx): string {
  const s = c.supabase
  if (!s) return ''
  return `## Connected Supabase project\n- URL: ${s.url}\n- Typed client present: ${s.hasClient ? 'yes (/src/lib/supabase.ts)' : 'NO — create it (or ask the user to press “Scaffold full-stack” in the Database panel)'}\n- /.env with VITE_SUPABASE_* present: ${s.hasEnv ? 'yes' : 'no'}\n- Known tables: ${s.tables.length ? s.tables.join(', ') : '(schema not loaded yet)'}\n`
}
