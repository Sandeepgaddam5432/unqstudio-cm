import { SYNC_FILE } from './snapshot'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

export interface DriveFile { id: string; name: string; modifiedTime?: string }

/** RFC 2387 multipart/related body: JSON metadata part + JSON content part. */
export function buildMultipartBody(metadata: Record<string, unknown>, content: string, boundary: string): string {
  return `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`
}

async function ok(res: Response, what: string) {
  if (res.ok) return res
  const hint = res.status === 401 ? ' Your Google session expired — sign in again.' : res.status === 403 ? ' Drive access was not granted (check the drive.appdata scope / enabled Drive API).' : ''
  throw new Error(`Google Drive ${what} failed (HTTP ${res.status}).${hint}`)
}

export async function findBackupFile(token: string, f: typeof fetch = fetch): Promise<DriveFile | null> {
  const q = encodeURIComponent(`name='${SYNC_FILE}'`)
  const res = await ok(await f(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)&pageSize=1`, { headers: auth(token) }), 'lookup')
  const j = await res.json() as { files?: DriveFile[] }
  return j.files?.[0] ?? null
}

/** Create or update the private AppData backup. Returns the Drive file id. */
export async function uploadBackup(token: string, json: string, f: typeof fetch = fetch): Promise<string> {
  const existing = await findBackupFile(token, f)
  const boundary = `unq-${Math.random().toString(36).slice(2)}`
  const meta = existing ? { name: SYNC_FILE } : { name: SYNC_FILE, parents: ['appDataFolder'] }
  const url = existing ? `${UPLOAD}/files/${existing.id}?uploadType=multipart&fields=id` : `${UPLOAD}/files?uploadType=multipart&fields=id`
  const res = await ok(await f(url, { method: existing ? 'PATCH' : 'POST', headers: { ...auth(token), 'Content-Type': `multipart/related; boundary=${boundary}` }, body: buildMultipartBody(meta, json, boundary) }), 'upload')
  return ((await res.json()) as { id: string }).id
}

export async function downloadBackup(token: string, f: typeof fetch = fetch): Promise<string | null> {
  const file = await findBackupFile(token, f)
  if (!file) return null
  return (await ok(await f(`${DRIVE}/files/${file.id}?alt=media`, { headers: auth(token) }), 'download')).text()
}
