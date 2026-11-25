import { DeployError, api, bytesToB64, sha1Hex, sha256Hex, type Log, type StaticFile } from './common'

/* ── Netlify: digest deploy ───────────────────────────────── */
export async function netlifyDigestPayload(files: StaticFile[]) {
  const map: Record<string, string> = {}
  const byHash = new Map<string, StaticFile>()
  for (const f of files) { const sha = await sha1Hex(f.bytes); map['/' + f.path] = sha; byHash.set(sha, f) }
  return { files: map, byHash }
}

export async function deployNetlify(i: { token: string; siteId?: string; siteName?: string; files: StaticFile[]; onLog?: Log }, f: typeof fetch = fetch) {
  const log = i.onLog ?? (() => {})
  const h = { Authorization: `Bearer ${i.token}`, 'Content-Type': 'application/json' }
  const base = 'https://api.netlify.com/api/v1'
  let siteId = i.siteId
  let site: any
  if (!siteId) {
    log('Creating Netlify site…')
    site = await api(f, 'Netlify', `${base}/sites`, { method: 'POST', headers: h, body: JSON.stringify(i.siteName ? { name: i.siteName } : {}) })
    siteId = site.id
  }
  const { files, byHash } = await netlifyDigestPayload(i.files)
  log('Creating deploy…')
  const deploy = await api(f, 'Netlify', `${base}/sites/${siteId}/deploys`, { method: 'POST', headers: h, body: JSON.stringify({ files, draft: false }) })
  const required: string[] = deploy.required ?? []
  log(`Uploading ${required.length} files…`)
  for (const sha of required) {
    const file = byHash.get(sha)
    if (!file) continue
    await api(f, 'Netlify', `${base}/deploys/${deploy.id}/files/${file.path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { Authorization: `Bearer ${i.token}`, 'Content-Type': 'application/octet-stream' }, body: file.bytes as BodyInit })
  }
  let state = deploy
  for (let n = 0; n < 40 && state.state !== 'ready' && state.state !== 'error'; n++) {
    await new Promise((r) => setTimeout(r, n === 0 ? 400 : 1500))
    state = await api(f, 'Netlify', `${base}/deploys/${deploy.id}`, { headers: h })
  }
  if (state.state === 'error') throw new DeployError(state.error_message ?? 'Netlify reported a deploy error')
  return { url: (state.ssl_url ?? state.url ?? site?.ssl_url ?? site?.url) as string, siteId: siteId as string, deployId: deploy.id as string }
}

/* ── Vercel: v13 deployments ──────────────────────────────── */
export function vercelPayload(name: string, files: StaticFile[]) {
  return {
    name: name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 52) || 'unqstudio-app',
    files: files.map((f) => ({ file: f.path, data: bytesToB64(f.bytes), encoding: 'base64' })),
    projectSettings: { framework: null, buildCommand: null, outputDirectory: null },
    target: 'production',
  }
}

export async function deployVercel(i: { token: string; teamId?: string; name: string; files: StaticFile[]; onLog?: Log }, f: typeof fetch = fetch) {
  const log = i.onLog ?? (() => {})
  const h = { Authorization: `Bearer ${i.token}`, 'Content-Type': 'application/json' }
  const q = i.teamId ? `?teamId=${encodeURIComponent(i.teamId)}` : ''
  log('Creating Vercel deployment…')
  const d = await api(f, 'Vercel', `https://api.vercel.com/v13/deployments${q}`, { method: 'POST', headers: h, body: JSON.stringify(vercelPayload(i.name, i.files)) })
  let state = d
  for (let n = 0; n < 40 && !['READY', 'ERROR', 'CANCELED'].includes(state.readyState); n++) {
    await new Promise((r) => setTimeout(r, 1500))
    state = await api(f, 'Vercel', `https://api.vercel.com/v13/deployments/${d.id}${q}`, { headers: h })
  }
  if (state.readyState === 'ERROR') throw new DeployError(state.errorMessage ?? 'Vercel reported a deployment error')
  return { url: `https://${state.url ?? d.url}`, id: d.id as string }
}

/* ── Cloudflare Pages: direct upload (best effort; browsers are usually blocked by CORS) ─── */
export async function cloudflareManifest(files: StaticFile[]) {
  const manifest: Record<string, string> = {}
  const byHash = new Map<string, StaticFile>()
  for (const f of files) { const hash = (await sha256Hex(f.bytes)).slice(0, 32); manifest['/' + f.path] = hash; byHash.set(hash, f) }
  return { manifest, byHash }
}

export async function deployCloudflare(i: { token: string; accountId: string; project: string; files: StaticFile[]; onLog?: Log }, f: typeof fetch = fetch) {
  const log = i.onLog ?? (() => {})
  const base = `https://api.cloudflare.com/client/v4/accounts/${i.accountId}/pages/projects`
  const h = { Authorization: `Bearer ${i.token}` }
  try { await api(f, 'Cloudflare', `${base}/${i.project}`, { headers: h }) } catch (e) {
    if (e instanceof DeployError && !e.blockedByBrowser && (e.status === 404 || e.status === 8000007)) {
      log('Creating Pages project…')
      await api(f, 'Cloudflare', base, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: i.project, production_branch: 'main' }) })
    } else throw e
  }
  const { manifest, byHash } = await cloudflareManifest(i.files)
  const form = new FormData()
  form.append('manifest', JSON.stringify(manifest))
  form.append('branch', 'main')
  for (const [hash, file] of byHash) form.append(hash, new Blob([file.bytes as BlobPart]), file.path)
  log('Uploading to Cloudflare Pages…')
  const r = await api(f, 'Cloudflare', `${base}/${i.project}/deployments`, { method: 'POST', headers: h, body: form })
  return { url: (r.result?.url as string) ?? `https://${i.project}.pages.dev` }
}

export const CLOUDFLARE_FALLBACK_STEPS = [
  'Push this project to GitHub or GitLab from the Git tab.',
  'Open dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git.',
  'Select the repository. Framework preset: Vite (or “None”).',
  'Build command: npm run build · Build output directory: dist.',
  'Save and Deploy. Every push redeploys automatically; add a custom domain under the project’s Custom domains tab.',
]
