// Tier 1 — build-time snapshot of https://models.dev/api.json → public/models-registry.json.
// Wired as `npm run sync:models` and `prebuild`. NEVER fails the build: when offline (or the payload looks broken)
// the committed snapshot is preserved untouched.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import * as esbuild from 'esbuild-wasm'

const OUT = 'public/models-registry.json'
const URL = process.env.MODELS_DEV_URL ?? 'https://models.dev/api.json'
const MIN_PROVIDERS = 30

async function loadNormalizer() {
  // The normalizer is TypeScript and import-free: transpile it in-memory and import it as a data: module.
  const ts = readFileSync('src/core/ai/modelsDev.ts', 'utf8')
  const { code } = await esbuild.transform(ts, { loader: 'ts', format: 'esm' })
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}

let status = 0
try {
  const mod = await loadNormalizer()
  let raw
  if (process.env.MODELS_DEV_FILE) raw = JSON.parse(readFileSync(process.env.MODELS_DEV_FILE, 'utf8'))
  else {
    const res = await fetch(URL, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    raw = await res.json()
  }
  const reg = mod.normalizeModelsDev(raw, { source: 'models.dev (build snapshot)' })
  if (reg.providers.length < MIN_PROVIDERS) throw new Error(`only ${reg.providers.length} providers — refusing to overwrite snapshot`)
  mkdirSync('public', { recursive: true })
  writeFileSync(OUT, JSON.stringify(reg))
  console.log(`✓ models.dev snapshot: ${reg.providers.length} providers, ${mod.countModels(reg)} models → ${OUT}`)
} catch (e) {
  console.warn(`⚠ models.dev sync skipped (${e instanceof Error ? e.message : e}); ${existsSync(OUT) ? 'keeping committed ' + OUT : 'NO snapshot present!'}`)
} finally {
  await esbuild.stop()
}
process.exit(status)
