import { SYNC_FILE } from './snapshot'

const API = 'https://api.github.com'
export const GIST_DESCRIPTION = 'UnQStudio cloud sync (private backup — managed automatically)'
const headers = (t: string, json = false): Record<string, string> => ({ Authorization: `Bearer ${t}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(json ? { 'Content-Type': 'application/json' } : {}) })

/** Payload for POST/PATCH /gists — always a SECRET (`public: false`) gist with a single JSON file. */
export function buildGistPayload(json: string, description = GIST_DESCRIPTION) {
  return { description, public: false, files: { [SYNC_FILE]: { content: json } } }
}

async function ok(res: Response, what: string) {
  if (res.ok) return res
  throw new Error(`GitHub Gist ${what} failed (HTTP ${res.status}).${res.status === 401 ? ' Sign in with GitHub again.' : res.status === 404 ? ' The gist scope may be missing.' : ''}`)
}

interface GistSummary { id: string; description?: string; files?: Record<string, { filename: string }> }
export async function findSyncGist(token: string, f: typeof fetch = fetch): Promise<string | null> {
  for (let page = 1; page <= 3; page++) {
    const list = await (await ok(await f(`${API}/gists?per_page=100&page=${page}`, { headers: headers(token) }), 'lookup')).json() as GistSummary[]
    const hit = list.find((g) => g.files?.[SYNC_FILE])
    if (hit) return hit.id
    if (list.length < 100) break
  }
  return null
}

export async function pushGist(token: string, json: string, f: typeof fetch = fetch): Promise<string> {
  const id = await findSyncGist(token, f)
  const res = await ok(await f(id ? `${API}/gists/${id}` : `${API}/gists`, { method: id ? 'PATCH' : 'POST', headers: headers(token, true), body: JSON.stringify(buildGistPayload(json)) }), 'upload')
  return ((await res.json()) as { id: string }).id
}

export async function pullGist(token: string, f: typeof fetch = fetch): Promise<string | null> {
  const id = await findSyncGist(token, f)
  if (!id) return null
  const g = await (await ok(await f(`${API}/gists/${id}`, { headers: headers(token) }), 'download')).json() as { files: Record<string, { content?: string; truncated?: boolean; raw_url?: string }> }
  const file = g.files[SYNC_FILE]
  if (!file) return null
  if (file.truncated && file.raw_url) return (await ok(await f(file.raw_url, { headers: headers(token) }), 'download')).text()
  return file.content ?? null
}
