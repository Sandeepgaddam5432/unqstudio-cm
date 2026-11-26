// Build-time snapshot of the unified Model Catalog → public/catalog-snapshot.json.
// Sources: Provider Directory (P2) + OpenRouter public API (P3) + LiteLLM model specs (P4); live per-provider /models (P1) is runtime-only.
// Wired as `npm run sync:catalog` (alias `sync:models`) and `prebuild`. NEVER fails the build: when offline (or a payload looks broken)
// the committed snapshot is preserved untouched, and a failing secondary source is simply skipped.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import * as esbuild from 'esbuild-wasm'

const OUT = 'public/catalog-snapshot.json'
const URL = process.env.CATALOG_DIRECTORY_URL ?? 'https://models.dev/api.json'
const MIN_PROVIDERS = 30

async function load(file) {
  // Both modules are TypeScript and runtime-import-free: transpile in-memory and import as data: modules.
  const ts = readFileSync(file, 'utf8')
  const { code } = await esbuild.transform(ts, { loader: 'ts', format: 'esm' })
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}

try {
  const dirMod = await load('src/core/ai/modelsDev.ts')
  const enr = await load('src/core/ai/catalogEnricher.ts')
  let raw
  if (process.env.CATALOG_DIRECTORY_FILE) raw = JSON.parse(readFileSync(process.env.CATALOG_DIRECTORY_FILE, 'utf8'))
  else {
    const res = await fetch(URL, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    raw = await res.json()
  }
  let reg = dirMod.normalizeModelsDev(raw, { source: 'build snapshot' })
  if (reg.providers.length < MIN_PROVIDERS) throw new Error(`only ${reg.providers.length} providers — refusing to overwrite snapshot`)
  const extra = process.env.CATALOG_OFFLINE ? {} : await enr.fetchEnrichment(fetch, { timeoutMs: 20_000 })
  reg = enr.enrichRegistry(reg, extra)
  mkdirSync('public', { recursive: true })
  writeFileSync(OUT, JSON.stringify(reg))
  console.log(`✓ catalog snapshot: ${reg.providers.length} providers, ${dirMod.countModels(reg)} models (openrouter:${!!reg.enriched?.openrouter} litellm:${!!reg.enriched?.litellm}) → ${OUT}`)
} catch (e) {
  console.warn(`⚠ catalog sync skipped (${e instanceof Error ? e.message : e}); ${existsSync(OUT) ? 'keeping committed ' + OUT : 'NO snapshot present!'}`)
} finally {
  await esbuild.stop()
}
process.exit(0)
