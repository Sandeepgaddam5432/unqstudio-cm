import { DeployError, api, type DeployFile, type Log } from './common'

export interface GitLabAction { action: 'create' | 'update'; file_path: string; content: string; encoding: 'text' | 'base64' }

export function buildGitLabActions(files: DeployFile[], existing: Set<string>): GitLabAction[] {
  return files.map((f) => ({ action: existing.has(f.path) ? 'update' : 'create', file_path: f.path, content: f.content, encoding: f.encoding === 'base64' ? 'base64' : 'text' }))
}

export interface GitLabPushInput {
  token: string; baseUrl?: string; project: string; branch?: string; message: string; files: DeployFile[]
  create?: { visibility: 'private' | 'public' | 'internal' }; onLog?: Log
}

export async function pushToGitLab(i: GitLabPushInput, f: typeof fetch = fetch) {
  const log = i.onLog ?? (() => {})
  const base = (i.baseUrl || 'https://gitlab.com').replace(/\/+$/, '') + '/api/v4'
  const h = { 'PRIVATE-TOKEN': i.token, 'Content-Type': 'application/json' }
  const id = encodeURIComponent(i.project)
  let project: any
  try { project = await api(f, 'GitLab', `${base}/projects/${id}`, { headers: h }) } catch (e) {
    if (e instanceof DeployError && e.status === 404 && i.create) {
      log('Creating GitLab project…')
      const name = i.project.split('/').pop()!
      project = await api(f, 'GitLab', `${base}/projects`, { method: 'POST', headers: h, body: JSON.stringify({ name, path: name, visibility: i.create.visibility, initialize_with_readme: true }) })
    } else throw e
  }
  const branch = i.branch || project.default_branch || 'main'
  const existing = new Set<string>()
  for (let page = 1; page <= 10; page++) {
    let batch: Array<{ path: string; type: string }>
    try { batch = await api(f, 'GitLab', `${base}/projects/${project.id}/repository/tree?recursive=true&per_page=100&page=${page}&ref=${encodeURIComponent(branch)}`, { headers: h }) } catch { break }
    for (const e of batch) if (e.type === 'blob') existing.add(e.path)
    if (batch.length < 100) break
  }
  log(`Committing ${i.files.length} files…`)
  const commit = await api(f, 'GitLab', `${base}/projects/${project.id}/repository/commits`, {
    method: 'POST', headers: h, body: JSON.stringify({ branch, commit_message: i.message, actions: buildGitLabActions(i.files, existing) }),
  })
  return { projectUrl: project.web_url as string, commitUrl: (commit.web_url as string) ?? project.web_url, branch }
}
