import type { Snapshot } from '@/core/vfs/types'
import { isBinaryPath } from '@/core/vfs/vfs'
import { DeployError, IGNORED_PATH, api, bytesToB64, mapLimit, utf8ToB64, type DeployFile, type Log } from './common'

const API = 'https://api.github.com'

export function parseRepoUrl(input: string): { owner: string; repo: string; ref?: string } | null {
  const s = input.trim().replace(/\.git$/, '')
  const m = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)(?:\/tree\/([^\s]+))?\/?$/.exec(s)
  return m ? { owner: m[1], repo: m[2], ref: m[3] } : null
}

const headers = (token?: string, json = false): Record<string, string> => ({
  Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}),
})
const gh = <T = any>(f: typeof fetch, token: string | undefined, method: string, path: string, body?: unknown) =>
  api<T>(f, 'GitHub', API + path, { method, headers: headers(token, body !== undefined), body: body === undefined ? undefined : JSON.stringify(body) })

/* ── import ──────────────────────────────────────────────── */
export async function importGitHubRepo(i: { owner: string; repo: string; ref?: string; token?: string; onLog?: Log }, f: typeof fetch = fetch) {
  const log = i.onLog ?? (() => {})
  const info = await gh(f, i.token, 'GET', `/repos/${i.owner}/${i.repo}`)
  const ref = i.ref || info.default_branch
  log(`Reading ${i.owner}/${i.repo}@${ref}…`)
  const tree = await gh(f, i.token, 'GET', `/repos/${i.owner}/${i.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`)
  const entries = (tree.tree as Array<{ path: string; type: string; sha: string; size?: number }>).filter((e) => e.type === 'blob' && !IGNORED_PATH.test(e.path) && (e.size ?? 0) <= 1_500_000)
  const picked = entries.slice(0, 500)
  const skipped = (tree.tree as unknown[]).length - picked.length
  log(`Downloading ${picked.length} files…`)
  const files: Snapshot = {}
  await mapLimit(picked, 8, async (e) => {
    const path = '/' + e.path
    let bytes: Uint8Array
    if (i.token) {
      const blob = await gh(f, i.token, 'GET', `/repos/${i.owner}/${i.repo}/git/blobs/${e.sha}`)
      const bin = atob(String(blob.content).replace(/\n/g, ''))
      bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    } else {
      const res = await f(`https://raw.githubusercontent.com/${i.owner}/${i.repo}/${encodeURIComponent(ref)}/${e.path.split('/').map(encodeURIComponent).join('/')}`)
      if (!res.ok) throw new DeployError(`Could not download ${e.path} (HTTP ${res.status})`, res.status)
      bytes = new Uint8Array(await res.arrayBuffer())
    }
    if (isBinaryPath(path)) files[path] = { c: bytesToB64(bytes), e: 'base64' }
    else {
      const text = new TextDecoder().decode(bytes)
      if (!text.includes('\u0000')) files[path] = { c: text, e: 'utf8' }
    }
  })
  return { files, ref, name: info.name as string, skipped, description: (info.description as string | null) ?? undefined }
}

/* ── push ────────────────────────────────────────────────── */
export interface PushInput {
  token: string; owner?: string; repo: string; branch?: string; message: string; files: DeployFile[]
  create?: { private: boolean; description?: string }
  onLog?: Log
}
export interface PushResult { owner: string; repo: string; branch: string; commitSha: string; commitUrl: string; repoUrl: string }

export const blobPayload = (f: DeployFile) => (f.encoding === 'base64' ? { content: f.content, encoding: 'base64' } : { content: f.content, encoding: 'utf-8' })
export const treePayload = (baseTree: string, entries: Array<{ path: string; sha: string }>) => ({
  base_tree: baseTree, tree: entries.map((e) => ({ path: e.path, mode: '100644', type: 'blob', sha: e.sha })),
})

export async function pushToGitHub(i: PushInput, f: typeof fetch = fetch): Promise<PushResult> {
  const log = i.onLog ?? (() => {})
  const branch = i.branch || 'main'
  const owner = i.owner || (await gh(f, i.token, 'GET', '/user')).login
  const base = `/repos/${owner}/${i.repo}`
  let info: any
  try { info = await gh(f, i.token, 'GET', base) } catch (e) {
    if (e instanceof DeployError && e.status === 404 && i.create) {
      log(`Creating repository ${owner}/${i.repo}…`)
      info = await gh(f, i.token, 'POST', '/user/repos', { name: i.repo, private: i.create.private, description: i.create.description ?? 'Created with UnQStudio', auto_init: true })
    } else throw e
  }
  let baseSha: string | undefined
  let refExists = true
  try { baseSha = (await gh(f, i.token, 'GET', `${base}/git/ref/heads/${branch}`)).object.sha } catch (e) {
    if (!(e instanceof DeployError) || ![404, 409].includes(e.status ?? 0)) throw e
    refExists = false
  }
  if (!baseSha) {
    try { baseSha = (await gh(f, i.token, 'GET', `${base}/git/ref/heads/${info.default_branch ?? 'main'}`)).object.sha } catch { /* empty repository */ }
  }
  if (!baseSha) {
    log('Empty repository – creating the first commit…')
    await gh(f, i.token, 'PUT', `${base}/contents/README.md`, { message: 'Initial commit', content: utf8ToB64(`# ${i.repo}\n`), branch })
    baseSha = (await gh(f, i.token, 'GET', `${base}/git/ref/heads/${branch}`)).object.sha
    refExists = true
  }
  const baseCommit = await gh(f, i.token, 'GET', `${base}/git/commits/${baseSha}`)
  log(`Uploading ${i.files.length} files…`)
  const entries = await mapLimit(i.files, 6, async (file) => ({ path: file.path, sha: (await gh(f, i.token, 'POST', `${base}/git/blobs`, blobPayload(file))).sha as string }))
  const tree = await gh(f, i.token, 'POST', `${base}/git/trees`, treePayload(baseCommit.tree.sha, entries))
  const commit = await gh(f, i.token, 'POST', `${base}/git/commits`, { message: i.message, tree: tree.sha, parents: [baseSha] })
  if (refExists) await gh(f, i.token, 'PATCH', `${base}/git/refs/heads/${branch}`, { sha: commit.sha, force: false })
  else await gh(f, i.token, 'POST', `${base}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha })
  log('Pushed ✓')
  return { owner, repo: i.repo, branch, commitSha: commit.sha, commitUrl: `https://github.com/${owner}/${i.repo}/commit/${commit.sha}`, repoUrl: `https://github.com/${owner}/${i.repo}` }
}

/* ── GitHub Pages ────────────────────────────────────────── */
export const PAGES_WORKFLOW = `name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm install
      - run: npm run build -- --base=/\${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`

export async function enablePages(token: string, owner: string, repo: string, f: typeof fetch = fetch) {
  try { await gh(f, token, 'POST', `/repos/${owner}/${repo}/pages`, { build_type: 'workflow' }) } catch (e) {
    if (!(e instanceof DeployError) || e.status !== 409) throw e // 409 = already enabled
  }
  return `https://${owner}.github.io/${repo}/`
}
