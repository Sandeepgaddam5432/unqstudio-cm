/** Host-side helpers for the preview iframe route bar (hash / history navigation through the bridge). */
export type RouteCommand = { type: 'route:navigate'; path: string } | { type: 'route:back' } | { type: 'route:forward' }

/** Normalise user input into an in-app route: leading slash, no hash prefix, no external URLs, no whitespace. */
export function normalizeRoute(input: string): string {
  let p = (input ?? '').trim().replace(/^#/, '')
  if (!p || /^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//')) return '/'
  p = p.replace(/\s+/g, '-')
  if (!p.startsWith('/')) p = '/' + p
  return p.replace(/\/{2,}/g, '/').slice(0, 200)
}

export const navigateCommand = (input: string): { type: 'route:navigate'; path: string } => ({ type: 'route:navigate', path: normalizeRoute(input) })

/** Validate a `route` message coming from the iframe (untrusted). */
export function parseRouteMessage(d: unknown): { path: string } | null {
  if (!d || typeof d !== 'object') return null
  const m = d as { type?: unknown; path?: unknown }
  return m.type === 'route' && typeof m.path === 'string' ? { path: normalizeRoute(m.path) } : null
}
