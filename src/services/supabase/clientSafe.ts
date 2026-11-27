import { jwtRole } from '@/core/deploy/supabase'

/** Throws when a service_role key would be embedded in browser code. */
export function clientSnippetSafe(key: string): string {
  if (jwtRole(key) === 'service_role') throw new Error('This is a service_role key. Never embed it in browser code — use the public anon key.')
  return key
}
