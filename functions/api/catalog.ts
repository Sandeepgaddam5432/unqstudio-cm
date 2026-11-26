// Cloudflare Pages Function: the unified live Model Catalog at the edge (GET /api/catalog; /api/models-dev is a legacy alias).
// Merges P2 Provider Directory + P3 OpenRouter public API + P4 LiteLLM model specs; any source may fail independently.
// Standard Web Fetch API only (no Node deps). Newly released providers/models appear without redeploying.
import { normalizeModelsDev } from '../../src/core/ai/modelsDev'
import { enrichRegistry, fetchEnrichment } from '../../src/core/ai/catalogEnricher'

type PagesFunction = (ctx: { request: Request }) => Response | Promise<Response>

const UPSTREAM = 'https://models.dev/api.json'
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function handleCatalog(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: CORS })
  try {
    const upstream = await fetchImpl(UPSTREAM, { headers: { Accept: 'application/json' } })
    if (!upstream.ok) throw new Error(`directory responded ${upstream.status}`)
    const base = normalizeModelsDev(await upstream.json(), { source: 'edge (live catalog)' })
    const registry = enrichRegistry(base, await fetchEnrichment(fetchImpl, { timeoutMs: 6000 }))
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

export const onRequest: PagesFunction = ({ request }) => handleCatalog(request)
