import type { IStorageAdapter } from '@/core/vfs/types'

export interface VaultBlob { v: 1; mode: 'plain' | 'encrypted'; salt?: string; iv?: string; iter?: number; data: string }

const enc = new TextEncoder()
const dec = new TextDecoder()
const toB64 = (u: Uint8Array) => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s) }
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const DEFAULT_ITERATIONS = 250_000

export async function deriveKey(pass: string, salt: Uint8Array, iterations = DEFAULT_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass) as BufferSource, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptWithKey(key: CryptoKey, json: string): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(json) as BufferSource)
  return { iv: toB64(iv), data: toB64(new Uint8Array(ct)) }
}
export async function decryptWithKey(key: CryptoKey, iv: string, data: string): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) as BufferSource }, key, fromB64(data) as BufferSource)
  return dec.decode(pt)
}

/** One-shot helpers (used by backup export and tests). */
export async function encryptJSON(value: unknown, pass: string, iterations = DEFAULT_ITERATIONS): Promise<VaultBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(pass, salt, iterations)
  const { iv, data } = await encryptWithKey(key, JSON.stringify(value))
  return { v: 1, mode: 'encrypted', salt: toB64(salt), iv, iter: iterations, data }
}
export async function decryptJSON<T = unknown>(blob: VaultBlob, pass: string): Promise<T> {
  if (blob.mode !== 'encrypted' || !blob.salt || !blob.iv) throw new Error('Not an encrypted blob')
  const key = await deriveKey(pass, fromB64(blob.salt), blob.iter ?? DEFAULT_ITERATIONS)
  try {
    return JSON.parse(await decryptWithKey(key, blob.iv, blob.data)) as T
  } catch {
    throw new Error('Wrong passphrase')
  }
}

/** Local secret vault: API keys & tokens. Optional passphrase → PBKDF2(SHA-256) → AES-GCM-256. Never leaves the device. */
export class Vault {
  private secrets: Record<string, string> = {}
  private key: CryptoKey | null = null
  private salt: Uint8Array | null = null
  private blob: VaultBlob | null = null
  private iter: number
  private storageKey: string

  constructor(private adapter: IStorageAdapter, opts: { iterations?: number; storageKey?: string } = {}) {
    this.iter = opts.iterations ?? DEFAULT_ITERATIONS
    this.storageKey = opts.storageKey ?? 'vault'
  }

  async load() {
    this.blob = (await this.adapter.kvGet<VaultBlob>(this.storageKey)) ?? null
    this.secrets = {}
    this.key = null
    if (this.blob?.mode === 'plain') this.secrets = JSON.parse(this.blob.data)
  }
  get encrypted() { return this.blob?.mode === 'encrypted' }
  get locked() { return this.encrypted && !this.key }

  async unlock(pass: string) {
    if (!this.blob || this.blob.mode !== 'encrypted') return
    const salt = fromB64(this.blob.salt!)
    const key = await deriveKey(pass, salt, this.blob.iter ?? DEFAULT_ITERATIONS)
    let json: string
    try { json = await decryptWithKey(key, this.blob.iv!, this.blob.data) } catch { throw new Error('Wrong passphrase') }
    this.secrets = JSON.parse(json)
    this.key = key
    this.salt = salt
    this.iter = this.blob.iter ?? this.iter
  }
  lock() { if (this.encrypted) { this.key = null; this.secrets = {} } }

  private assertOpen() { if (this.locked) throw new Error('Vault is locked') }
  get(name: string): string | undefined { return this.locked ? undefined : this.secrets[name] }
  names(): string[] { return this.locked ? [] : Object.keys(this.secrets) }
  async set(name: string, value: string) { this.assertOpen(); this.secrets[name] = value; await this.persist() }
  async delete(name: string) { this.assertOpen(); delete this.secrets[name]; await this.persist() }

  async enableEncryption(pass: string) {
    this.assertOpen()
    if (pass.length < 6) throw new Error('Use a passphrase of at least 6 characters')
    this.salt = crypto.getRandomValues(new Uint8Array(16))
    this.key = await deriveKey(pass, this.salt, this.iter)
    await this.persist()
  }
  async disableEncryption() {
    this.assertOpen()
    this.key = null
    this.salt = null
    await this.persist()
  }
  async wipe() {
    this.secrets = {}
    this.key = null
    this.blob = null
    await this.adapter.kvDelete(this.storageKey)
  }

  private async persist() {
    const json = JSON.stringify(this.secrets)
    if (this.key && this.salt) {
      const { iv, data } = await encryptWithKey(this.key, json)
      this.blob = { v: 1, mode: 'encrypted', salt: toB64(this.salt), iv, iter: this.iter, data }
    } else this.blob = { v: 1, mode: 'plain', data: json }
    await this.adapter.kvSet(this.storageKey, this.blob)
  }
  /** Raw stored blob (encrypted blobs stay encrypted) – safe to include in backups. */
  exportBlob(): VaultBlob | null { return this.blob }
}
