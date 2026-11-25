// Tier 2 — Cloudflare Pages Function: live models.dev registry at the edge (GET /api/models-dev).
// Standard Web Fetch API only (no Node deps). Newly released providers/models appear without redeploying.
import { normalizeModelsDev } from '../../src/core/ai/modelsDev'

type PagesFunction = (ctx: { request: Request }) => Response | Promise<Response>

const UPSTREAM = 'https://models.dev/api.json'
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function handleModelsDev(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: CORS })
  try {
    const upstream = await fetchImpl(UPSTREAM, { headers: { Accept: 'application/json' } })
    if (!upstream.ok) throw new Error(`models.dev responded ${upstream.status}`)
    const registry = normalizeModelsDev(await upstream.json(), { source: 'edge (live models.dev)' })
    return new Response(JSON.stringify(registry), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'upstream failure' }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
}

export const onRequest: PagesFunction = ({ request }) => handleModelsDev(request)
