# 03 · Models & AI Engine

Code-level spec of the model pipeline and the AI engine. Symbols live in `src/core/ai/**` (see `DOCS/02` for exact signatures).

## 1. The 3-tier model discovery pipeline

```
 Tier 1  build-time   scripts/sync-models-dev.mjs ─► public/models-registry.json   (committed snapshot, offline-safe)
 Tier 2  live edge    functions/api/models-dev.ts ─► /api/models-dev               (s-maxage=3600, CORS *)
                      client chain: /api/models-dev → https://models.dev/api.json → /models-registry.json
                      cached in IndexedDB  unqstudio-registry / kv / "registry"  (24h TTL, "Refresh Registry" forces)
 Tier 3  live per-provider   src/core/ai/modelFetcher.ts   GET <provider>/models with the user's key
                      → enriched with models.dev metadata → store/models `live[providerId]`
```
**Resolution order for any provider's model list** (`modelsForProvider` in `src/store/aiConfig.ts`):
`live /models (enriched)` → `models.dev catalog (alias-aware)` → `built-in static list (offline fallback only)`; user-added custom IDs are always appended. Nothing is hard-coded as the primary mechanism.

### 1.1 Normalizer — `src/core/ai/modelsDev.ts` (pure, import-free)
Shared by the Node script (transpiled in-memory via `esbuild-wasm` and imported as a `data:` module), the edge function and the browser.
- `normalizeModelsDev(raw, {source, now}) → Registry` — `{version:1, generatedAt, source, providers: RegProvider[]}`.
- `RegProvider`: `id, name, api?, doc?, logo (https://models.dev/logos/{id}.svg), npm?, env?, kind ('openai'|'anthropic'), compat, models[]`.
- `RegModel`: `id, name, context?, output?, cost{input,output} (USD / 1M tok), reasoning?, vision? (image in modalities.input), tool_call?, modalities?, release_date?`. Deprecated models are dropped; models sorted newest-first.
- `KNOWN_API`: models.dev omits `api` for first-party SDK providers (OpenAI, Anthropic, Google, xAI, Groq, Mistral, Cerebras, Together, Perplexity, Cohere, DeepInfra, OpenRouter, Vercel, Venice, DeepSeek) — their public endpoints are tabulated here.
- `REGISTRY_ALIAS`: built-in ids that differ from models.dev ids (`gemini→google`, `together→togetherai`, `fireworks→fireworks-ai`, `moonshot→moonshotai`, `github→github-models`). Built-ins keep their ids so saved keys keep working.
- Synthetic local providers `ollama` and `lmstudio` are always added.

### 1.2 Compatibility classification (`classifyProvider`)
| class | rule | UI tag |
|---|---|---|
| `local` | `ollama`, `lmstudio`, or base URL host is localhost/127.0.0.1/0.0.0.0 | Local 💻 |
| `requires-proxy` | id/npm matches `amazon-bedrock | google-vertex | azure | watsonx | sap-ai-core | cloudflare-ai-gateway | gitlab | salad-cloud | qvac | merge-gateway`, **or no usable base URL** | Requires Proxy / Gateway 🔌 |
| `browser-ready` | everything else with a base URL (from `api` or `KNOWN_API`) | Browser-Ready 🟢 |
`kind = 'anthropic'` when `id==='anthropic'` or the npm package contains `anthropic` (Anthropic Messages wire format), else `'openai'`.

### 1.3 `scripts/sync-models-dev.mjs`
`npm run sync:models` and `prebuild`. Fetches `https://models.dev/api.json` (30 s timeout), normalizes, refuses to overwrite if `< 30` providers, writes compact JSON (~2.4 MB, ~220 KB gzip). **Never fails the build**: any error ⇒ warning + committed snapshot is kept. Env: `MODELS_DEV_FILE` (local raw file), `MODELS_DEV_URL`.

### 1.4 `functions/api/models-dev.ts` (Cloudflare Pages Function)
`onRequest` → `handleModelsDev(request, fetchImpl)`: OPTIONS→204, non-GET→405, GET fetches upstream, normalizes (`source: 'edge (live models.dev)'`), returns `Cache-Control: public, max-age=300, s-maxage=3600` + `Access-Control-Allow-Origin: *`; upstream failure → 502 JSON (client falls through to the next tier). Newly released providers appear without redeploy.

### 1.5 Client registry — `src/core/ai/modelsRegistry.ts`
`fetchRegistry(fetchImpl)` (tier chain, validates `content-type` and shape so an SPA-fallback HTML response is rejected), `loadRegistry({force, now, fetchImpl})` (IndexedDB cache, 24h TTL, stale-on-total-failure, bundled-source merged with the cached copy via `mergeRegistries`), `mergeRegistries(base, overlay)` (overlay wins per id; nothing in base is ever lost). State in `useModels` (`src/store/models.ts`): `registry, registrySource, syncedAt, registryStatus, live{}`. UI: `RegistryCard` (Settings → Providers) and the picker footer show source, last-synced time and **Refresh Registry**.

### 1.6 Live per-provider fetch — `src/core/ai/modelFetcher.ts`
`liveEndpoint(provider, key, baseOverride)`:
| provider | request |
|---|---|
| OpenAI-compatible (OpenRouter, OpenAI, Groq, DeepSeek, xAI, Mistral, Moonshot, Together, Fireworks, Cerebras, Perplexity, Hyperbolic, GitHub Models, LM Studio, Custom, **any models.dev provider**) | `GET {baseUrl}/models`, `Authorization: Bearer <key>` |
| Google Gemini | `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=<key>`; ids stripped of `models/`, only `generateContent` models |
| Anthropic | `GET {base}/models?limit=1000` with `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true` |
| Ollama | `GET {base minus /v1}/api/tags` |
`enrichModels(live, catalog)` matches exact → case-insensitive → last path segment (strips `:free/:latest/:beta`) and merges pretty name, context, pricing, vision/reasoning/tool badges. `fetchLiveModels` never throws: failures (`nokey | http | network | parse | empty`) return the catalog as fallback so the user can still add a custom model ID. Triggers: debounced (900 ms) auto-fetch while typing a key in `ProviderKeyForm`, on save, a manual **Fetch Models** button (spinner + error badge), and automatic fetch for configured providers when the picker opens.

### 1.7 Dynamic adapter routing
`registryProviderToDef(rp)` turns *any* registry provider into a `ProviderDef` (`dynamic: true`, `baseUrl = rp.api`). `allProviders()` appends them; `resolveProvider(id)` finds them, so `streamChat` (universal OpenAI-compatible SSE adapter, or Anthropic adapter when `kind==='anthropic'`) works with **zero code changes** for providers that did not exist at build time. Registry providers are opt-in (`isProviderEnabled`: `enabled[id] ?? !dynamic`). `setModelLookup` lets `findModel()` price/badge non-built-in models for the token meter.

## 2. Streaming & adapters (`stream.ts`)
`sseEvents(body)` incremental SSE decoder → `buildOpenAIRequest` / `buildAnthropicRequest` → `streamChat(req): AsyncGenerator<StreamChunk>` (`text | reasoning | usage | done`), with `ProviderError` classification (401/403/429/network/CORS hints). `stream_options.include_usage` is omitted for providers that reject it (`gemini, cohere, github, perplexity`).

## 3. Artifact (streaming parser) grammar — `parser.ts`
```
<think>…</think>
<create_file path="/src/x.tsx">…</create_file>
<update_file path="…">full content</update_file>
<patch_file path="…"><<<<<<< SEARCH … ======= … >>>>>>> REPLACE</patch_file>
<delete_file path="…" />
```
Incremental: tags may be split across chunks anywhere (`couldBePrefix`, `partialSuffixLen`). Events: `text | think-start/delta/end | file-start/delta/end | delete`. Markdown fences inside file blocks are stripped (`cleanFileContent`).

## 4. Search/replace patch engine — `patch.ts`
`parsePatchBlocks(body)` → `PatchBlock[]`; `applyPatch(content, blocks)` → `PatchResult {ok, content, applied, failures[]}`. Exact match first, then **fuzzy** line match (whitespace-normalised, re-indented to the matched block). Failures are reported per block with the offending SEARCH text so the model can retry. `apply.ts` applies ops to the VFS honouring file locks and creating a checkpoint first (`autoCheckpoint`).

## 5. Key vault — `vault.ts` (+ `store/vault.ts`)
Keys are stored in IndexedDB as `VaultBlob {v:1, mode:'plain'|'encrypted', salt, iv, iter, data}`. With a passphrase: PBKDF2-SHA256 (`DEFAULT_ITERATIONS`) → **AES-GCM-256**, random 16-byte salt, random 12-byte IV per write; the derived `CryptoKey` is non-extractable and held in memory only while unlocked. Provider secrets use the name `provider:{id}`; OAuth tokens are never stored here.

## 6. Orchestrator — `orchestrator.ts`
`buildMessages({vfs, mode, history, userText, pinned, includeAllFiles})` assembles system prompt (`prompts.ts`) + project context (token-budgeted) + history; `runTurn` streams, parses and applies; `enhancePrompt`, `testConnection` live here too. Modes: `build | plan | ask`.

## v2.1 — Four-source unified catalog
`fetchRegistry()` (src/core/ai/modelsRegistry.ts): directory chain `api/catalog` → `api/models-dev` (legacy alias) → direct upstream (normalized in-browser) → `catalog-snapshot.json`; then `fetchEnrichment()` pulls **OpenRouter** (`https://openrouter.ai/api/v1/models`, public, CORS) and **LiteLLM** (`…/BerriAI/litellm/main/model_prices_and_context_window.json`, GitHub raw CORS) in parallel (8s / 15s timeouts) and `enrichRegistry()` merges them **fill-only**. OpenRouter prices are USD/token strings → ×1e6; LiteLLM rows are filtered to chat-capable `mode`s. If the edge already merged both (`registry.enriched`), the client skips enrichment. Cache: IndexedDB `unqstudio-registry` 24h TTL + manual "Refresh Catalog". Internal sources are documented here only — the UI says "Model Catalog" / "Provider Directory".

## v2.1 — Four wire protocols (`ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'ollama'`)
| Kind | Chat | Models | Notes |
|---|---|---|---|
| `openai` | `POST {base}/chat/completions` (SSE) | `GET {base}/models` | `stream_options.include_usage` except Gemini-compat/Cohere/GitHub/Perplexity |
| `anthropic` | `POST {base}/messages` (SSE; `/v1` auto-appended when the base has no version) | `GET {base}/v1/models?limit=1000` | `anthropic-dangerous-direct-browser-access` unless `browserAccess === false` |
| `gemini` | `POST {root}/v1beta/models/{model}:streamGenerateContent?alt=sse&key=…` | `GET {root}/v1beta/models?pageSize=1000` | `thought` parts + inline `<think>` (hold-back splitter `thinkSplit`) → `reasoning`; images → `inlineData`; `usageMetadata` emitted once at stream end; `root` strips `/v1`, `/v1beta`, `/v1beta/openai` |
| `ollama` | `POST {root}/api/chat` (NDJSON) | `GET {root}/api/tags` | `message.thinking` → `reasoning`; images → base64 `images[]`; `eval_count` → usage |
Per-provider `headers` are merged LAST into both chat and `/models` requests (custom headers win). Custom providers (`custom:<slug>`) persist only non-secret fields in `unq.customProviders.v1`; the key is vault secret `provider:<id>` and header values are vault secret `provider-headers:<id>`.

## v2.1 — Self-heal loop, inline edit, symbol map
- **Self-heal** (`core/ai/selfHeal.ts`, wired in `store/chat.ts#runHeal`): after a Build-mode turn applies ≥1 file op (and `flags.autoHeal !== false`), the store waits for the REAL esbuild-wasm result (`usePreview`: status leaves `building`, plus a 1.8 s runtime-crash window), then `selfHealLoop` feeds `[source] file:line — message` + ±6 numbered lines of the offending files (≤3) back as an `auto` turn, up to `maxAutoHealSteps` (1–3, default 3). Guards: stops on **green**, **max attempts**, **abort** (pill Stop), **no progress** (same error signature, or 0 ops applied). Heal turns are `send({auto:true})` so they never recurse. The pill's Undo calls `undoTurn(originId)` → restores the checkpoint taken before the ORIGINAL turn (the whole series).
- **Inline edit** (`core/ai/inlineEdit.ts`, `ui/code/InlineEditWidget.tsx`, `CodeEditor.tsx`): selection → whole lines (`expandToLines`) → `streamChat` with ±40 lines of context at temperature 0.2 → `extractReplacement` → `diffPreview` → Accept: refuses when the file is locked or the selection text changed, takes an `auto` checkpoint, then dispatches ONE CodeMirror transaction (⌘Z works).
- **Symbol map** (`core/ai/repoMap.ts`, `prompts.buildProjectContext`): full text goes to pinned/@mentioned files and entry files (`ENTRY_FILES`); other mappable files share `fullShare` (40%) of the budget and the rest become one-line symbol-map entries (`mapped: true`). Projects under that budget are unchanged. In the unit test with 41 components the context is <40% of the full-text size.

## v3.0 chat intelligence
`core/ai/followUpSuggestions.ts` (rule-based chips), `core/ai/versions.ts` (version numbering) and `core/ai/buildSteps.ts` (activity steps) are pure modules with tests in `chat-v3.test.ts`.

## v3.0 Project Knowledge
`ProjectMeta.knowledge` (markdown, ≤ `KNOWLEDGE_MAX` = 8,000 chars) is emitted as `### Project Knowledge` directly under `## Project:` in `buildProjectContext()`, so every turn (chat, heal, inline edit via the shared context builder) sees the author's standing instructions.

## v3.0 Multi-step agent loop
Flow: Build turn applies artifacts → `runHeal` → (flag `agentLoop`, default on) `runAgentLoop({ startWithVerify })` → per step: model turn via `chat.send({auto:true})` → parse `<read_file|list_files|search_project|verify_build>` → observations → next step; green stops, `max-steps`/`aborted`/`answered` end. Safety: max 5 steps, abort via the status pill, locks enforced by `applyOp`, one `Undo turn` restores the pre-turn checkpoint. Symbol graph: `buildSymbolGraph()` + `resolveImport()` in `repoMap.ts`.

## v3.4 Resilient streaming & resumable writes (`src/core/ai/resilientStream.ts`)
Failure removed: a reply cut off by the output-token limit, a dropped connection, a proxy timeout or a silent stall used to discard the half-written file ("nothing was written").
- **Watchdog** — `watchdogStream` wraps every provider stream: 120 s time-to-first-token budget, then a **28 s chunk-gap** stall budget (`StreamStallError`); it aborts the underlying fetch. All four wire protocols go through it (it wraps `streamChat`).
- **Interruption model** — `runResilient` feeds `ArtifactStreamParser`. An unclosed `<create_file>/<update_file>/<patch_file>` (`file-end{complete:false}`), a thrown retryable error (`StreamStallError`, `ProviderError` with no status / 5xx / 408 / 429) or a dangling half-tag (`ArtifactStreamParser.flushInterrupted()` drops `<create_fi…` instead of printing it) is an *interruption*, never a failure.
- **Auto-continuation** (≤ `MAX_CONTINUATIONS` = 2 per file, back-off 700 ms · 2ⁿ): the model gets the **last 25 lines** of the saved partial (`buildContinuationMessages`) and must continue from the next line; the answer is stitched by `stitchContinuation` (exact-overlap + mid-line fragment de-duplication; overlaps < 12 significant chars are kept so a legitimate `}` survives). Tag-less answers (plain/fenced code) are accepted. A file with < 3 lines, a `patch_file`, or no open file at all is retried with a *tighter, patch-first* instruction (`buildRetryMessages`).
- **Live status** (`TurnEvent{type:'status'}` → `ChatMessage.liveStatus`): `Writing /src/App.tsx · 148 lines…`, `Stream stalled at line 148 of /src/App.tsx — resuming automatically (1/2)…`.
- **Partial salvage** — completed files are applied as they finish and the turn still gets its `checkpointAfter`. When retries are exhausted the file becomes `OpRecord{status:'interrupted', partial, lines, interruptedReason}` and `TurnResult.interrupted[]`/`error` are returned instead of throwing (throw only when nothing at all was produced, e.g. HTTP 401). UI: `RecoveryCard` in `MessageView` — "2/3 files saved · /src/Dashboard.tsx interrupted at line 148" + **Resume** (`chat.recover(msg, op, 'resume')`, continues from the partial) and **Retry failed file only** (`'retry'`, rewrites from scratch); the op record is updated in place via `TurnInput.resume`.
- **Locks** — a locked file is never continued (zero tokens spent); the partial is handed to `applyOp` which reports `skipped-locked`. `applyOp` re-checks at write time.
- **Abort** — user abort stops immediately (no retry, no back-off wait), keeps the partial as `interrupted` (`reason:'aborted'`) so it can be resumed.
- **Prompts** — `PROTOCOL` now *strictly* requires `<patch_file>` for edits to files > 40 lines and adds chunk-budget discipline (small focused files, core files first, brief `<think>`).
- Tests: `src/core/ai/resilientStream.test.ts` (parser mid-tag, stitching, watchdog TTFT vs stall, continuation prompt/tail, retry cap, salvage, locks, abort, loose continuation, runTurn+VFS resume end-to-end).
