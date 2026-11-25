import type { CheckpointPayload, Snapshot } from './types'

export async function pack(snap: Snapshot): Promise<CheckpointPayload> {
  const json = JSON.stringify(snap)
  try {
    if (typeof CompressionStream !== 'undefined' && typeof Blob !== 'undefined') {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
      return { compressed: true, data: new Uint8Array(await new Response(stream).arrayBuffer()) }
    }
  } catch {
    /* fall through to uncompressed storage */
  }
  return { compressed: false, data: json }
}

export async function unpack(p: CheckpointPayload): Promise<Snapshot> {
  if (!p.compressed) return JSON.parse(p.data as string) as Snapshot
  const stream = new Blob([p.data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return JSON.parse(await new Response(stream).text()) as Snapshot
}

/** cyrb53 – fast, well distributed non-cryptographic hash. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function hashSnapshot(snap: Snapshot): string {
  let acc = ''
  for (const p of Object.keys(snap).sort()) acc += p + '\u0000' + snap[p].e + snap[p].c + '\u0001'
  return hashString(acc)
}
