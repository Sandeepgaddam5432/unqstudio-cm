import { getRuntime } from '@/core/runtime'
import type { Template } from '@/templates/types'

/** Session cache + serial queue: one esbuild-wasm instance, so thumbnails compile one at a time (never a CPU spike). */
const cache = new Map<string, Promise<string | null>>()
let chain: Promise<unknown> = Promise.resolve()

/** Compile a template into a standalone production HTML document (no dev bridge). Resolves null when the build fails. */
export function templatePreviewHtml(t: Pick<Template, 'id' | 'files'>): Promise<string | null> {
  const hit = cache.get(t.id)
  if (hit) return hit
  const p = (chain = chain.then(async (): Promise<string | null> => {
    try {
      const engine = await getRuntime()
      await engine.init()
      const r = await engine.build({ files: t.files, binary: {}, production: true })
      return r.ok && r.html ? r.html : null
    } catch { return null }
  })) as Promise<string | null>
  cache.set(t.id, p)
  return p
}

/** Test hook. */
export function _clearTemplatePreviewCache() { cache.clear() }

/** Virtual desktop viewport the template is laid out in before being scaled down into the card. */
export const PREVIEW_VIEWPORT = { w: 1280, h: 800 } as const
