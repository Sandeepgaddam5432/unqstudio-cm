# 08 · Improvements & Roadmap — brutally honest audit (v2.1)

Benchmarked against **Lovable.dev, v0.dev, Cursor and Claude Code**. Metrics were measured on this repository at the v2.1 release commit (`npm run build`, `npm run test`, `npm run e2e`).

## Measured baseline
| Metric | Value |
|---|---|
| Source files / lines (non-test, `src`+`functions`) | 166 files · 13450 lines (`src` only) |
| Unit tests | 353 (Vitest, jsdom, fake-indexeddb) |
| E2E | 182 checks (was 68 at v2.1; counted at v3.3.1) in headless Chromium against the production `dist/` (`scripts/e2e.mjs`) |
| Main JS chunk | 411 kB (index-*.js); CodeMirror chunk 573 kB (lazy, Code Mode only) |
| Bundled catalog snapshot | 2368 kB (`public/catalog-snapshot.json`, 327 providers · ~9.4k models; fetched, **not** in the JS bundle) |
| Bundled brand glyphs | 41 kB source (`src/ui/icons/brandSvgs.ts`, 35 glyphs, inside the main chunk) |
| Picker windowing | 28 DOM rows over a 28,944 px list (320+ providers); full-list scroll of 60 frames in ~1.2 s with ≤ 37 rows mounted (E2E) |

## Where v2.1 is honestly weaker (with file paths)
1. **No agent tool loop.** `src/core/ai/orchestrator.ts` is one-shot: prompt → file tags/patches. Claude Code and Cursor Agent *read, grep, run and iterate* inside one task; UnQStudio only has the bounded Auto-Heal loop (`src/core/ai/selfHeal.ts`, ≤ 3 rounds, compile errors + a 1.8 s runtime window — runtime errors after user interaction are invisible to it).
2. **Static-browser ceiling.** The runtime (`src/core/runtime/`) is esbuild-wasm + esm.sh: no `npm install`, no Node APIs, no SSR/Next.js, no real database. Lovable ships Supabase-backed full-stack apps and v0 targets Next.js on Vercel; we only generate a typed Supabase client (`src/core/deploy/supabase.ts`). First load of a new npm package is network-bound (esm.sh) and unavailable offline (`src/core/runtime/cdnCache.ts` caches only what was already fetched).
3. **Context intelligence is regex-grade.** `src/core/ai/repoMap.ts` extracts exports/imports with regexes: no `export *` resolution, no type-aware call graph, no embeddings or semantic search. Cursor's codebase index and Claude Code's grep/read tools find relevant code we never show the model (the map is the only signal for non-pinned files beyond the 28k-char full-text budget).
4. **Inline edit is single-selection.** `src/ui/code/InlineEditWidget.tsx` edits one contiguous line range with one prompt. No multi-file apply, no multi-cursor, no ghost-text “Tab” completion (Cursor Tab), no follow-up refinement turns on the same diff.
5. **No real-LLM end-to-end in CI.** E2E mocks `/models`; chat/heal/inline flows are unit-tested with fake streams (`src/core/ai/protocols.test.ts`, `leapfrog.test.ts`). There is no recorded-fixture replay of full provider conversations.
6. **Third-party-catalog trust.** The Model Catalog depends on three public upstreams (`src/core/ai/catalogEnricher.ts`). The merge is fill-only and fail-safe, but a wrong upstream price/limit is displayed as fact. The 2368 kB snapshot is a plain JSON (CDN gzip only).
7. **Accessibility gaps.** The windowed picker (`src/ui/chat/ModelPicker.tsx`) exposes `listbox/option` roles but has no roving tabindex / arrow-key navigation, and rows must stay a constant 36 px.
8. **Security model is BYOK-in-browser.** Keys and custom-header values are encrypted only when the user sets a vault passphrase (`src/core/ai/vault.ts`); otherwise they sit in IndexedDB in clear text. Many providers do not allow browser CORS at all (flagged *Requires Proxy*).
9. **Console noise on pure-static hosts.** The optional `/api/auth/github?action=status` probe (`src/store/auth.ts`) 404s where Pages Functions are absent (harmless; mocked in E2E).
10. **Heal turns clutter the chat.** Each Auto-Heal round is a visible assistant turn (transparent, but noisy) and costs tokens.

## Where UnQStudio already beats the closed-source tools
- **Zero backend, zero lock-in, zero credits:** BYOK for 300+ providers + any custom endpoint over 4 wire protocols (OpenAI, Anthropic, Gemini-native, Ollama-native); Lovable/v0 meter you on their credit systems and only offer their models.
- **Local models first-class:** Ollama / LM Studio straight from the browser, no relay.
- **Everything is yours:** IndexedDB project store, gzip checkpoints with restore/fork/diff, AI-proof file & folder locks, ZIP/Git/Netlify/Vercel/Cloudflare export — no account needed (Lovable/v0 require sign-in).
- **Provider freedom per turn:** switch model/provider mid-project; the picker shows live `/models` for *your* key with context/pricing/capability metadata from a 4-source catalog.
- **Transparent, bounded autonomy:** Auto-Heal shows its attempts, honours a max, and one click undoes the whole series — closed tools rarely expose that control.
- **Verifiable docs:** `npm run verify:docs` fails on any undocumented/stale file or lazy purpose; the code map includes persistence inventory and class method signatures.

## Roadmap (all achievable on Cloudflare Pages static + light edge functions)
### P0 — v2.2
1. **Agent tool loop** (`orchestrator.ts` + new `src/core/ai/tools.ts`): `read_file`, `grep`, `list_dir`, `apply_patch`, `get_build_errors`, all against the VFS and `usePreview` — multi-step reasoning without a server (OpenAI/Anthropic/Gemini/Ollama tool-calling already exposed via `tool_call` catalog flags).
2. **Opt-in CORS relay** (`functions/api/proxy.ts`, allow-list + header pass-through, never stores keys) for *Requires Proxy* providers and CORS-hostile gateways.
3. **Runtime error capture after interaction** in Auto-Heal: keep the bridge `error` stream open for 10 s after the build and let heal turns collapse into one expandable group (`src/ui/chat/MessageView.tsx`).
### P1 — v2.3
4. **Type-aware symbol map in a worker** (TypeScript compiler API or tree-sitter-wasm) with `export *` resolution, call/usage edges, and an IndexedDB cache keyed by file hash; add lightweight BM25 search over the map for `@semantic` context.
5. **Multi-file inline refactor** and *Tab* ghost-text completion (CodeMirror `inlineSuggestion`) with a small/fast model chosen from the catalog by `cost` + `context`.
6. **Recorded-fixture conversation tests** (Playwright HAR replay per provider wire format) so full chat → apply → heal flows run in CI without keys.
7. **A11y pass**: arrow-key/roving-tabindex listbox, focus return, `aria-activedescendant` for the windowed picker; automated axe check in E2E.
8. **Snapshot diet:** drop unused fields, brotli at the edge, and split per-provider shards loaded on demand (target < 600 kB over the wire).
### P2 — v3.0
9. **WebContainer-class runtime option** (optional, user-enabled) for Node/npm, plus a Cloudflare D1/R2-backed “project share link” (static viewer + read-only fork).
10. **Collaborative sessions** over WebRTC (Yjs) with the existing checkpoint timeline as the merge unit.
11. **Template marketplace** via the existing plugin registry JSON (`src/core/plugins.ts`) hosted as static files with signature verification.
12. **Edge-side usage analytics opt-in** (privacy-preserving, aggregate only) to tune default models per provider.

## v3.0 post-task audit (honest)
**Closed from v2.1:** P0 #1 agent tool loop (client-side read/search/verify + self-heal, bounded 1–5, abortable, undoable); P1 #7 picker keyboard navigation (`aria-activedescendant`, Home/End/Enter/Escape); symbol map now has prop contracts, store slices and import edges (partial P1 #4); mobile UX gap vs Lovable (native shell, sheets, drawer, floating switcher); Project Knowledge, inline Version Cards, follow-up chips, QR/SEO publish sheet, route bar and mobile visual editing.

**Measured at release:** 440+ unit tests (Vitest), 106 headless-Chromium E2E checks on production `dist/`, main JS chunk ≈ 0.45 MB (CodeMirror/esbuild lazy), QR encoder 0 dependencies (validated by jsQR in tests).

**Still weaker (with files):**
1. *Agent uses text tags, not provider-native function calling* (`core/ai/agentLoop.ts`): works on every protocol, but models may ignore the tags; no parallel tool calls.
2. *Opt-in CORS relay (P0 #2) not built* — `Requires Proxy` providers remain unusable from the browser.
3. *Runtime-error window after the build is still ~1.8 s* (`store/chat.ts` `waitBuild`) — interaction-time errors are invisible to the agent (P0 #3).
4. *Thumbnails are layout snapshots, not pixel screenshots* (`core/preview/thumbnail.ts`): faithful to colours/text/boxes, not images, gradients or canvas.
5. *Route bar is hash-first* (ADR-015): BrowserRouter apps in the srcdoc iframe are best-effort.
6. *QR limited to versions 1–10* (≤ 154 bytes at ECC M); longer URLs hide the QR.
7. *Follow-up chips are rule-based* (ADR-014) and English-only.
8. *E2E seeds chat history instead of replaying a real LLM stream*; recorded-fixture conversation tests (P1 #6) remain open. Drag gestures are verified with mouse-emulated pointer events, not real touch hardware; haptics cannot be verified headless.
9. *Inspector source mapping is regex/unique-match based* (`core/runtime/inspectorEdit.ts`): ambiguous Tailwind class strings are refused rather than guessed.
10. *Home thumbnails only exist after a project has been previewed once.*

**Roadmap v3.1+**
- P0: opt-in CORS relay (`functions/api/proxy.ts`); provider-native tool calling behind the same `AgentDeps`; 10 s post-build runtime-error capture.
- P1: type-aware symbol graph in a worker; multi-file inline refactor + ghost-text completion; recorded-fixture chat E2E; axe accessibility run in E2E; per-provider catalog shards.
- P2: WebContainer-class runtime option; project share links (static viewer + read-only fork); Yjs collaboration on checkpoints; template marketplace via signed plugin registry.

## v3.1 honest audit & v3.2 roadmap
- **Permissions**: `Project edits` and `Publishing` are enforced (`gate()`); `Build / Auto-heal` and `Connectors` are stored and shown but not yet enforced inside the agent loop / connector calls (P1).
- **Chats → Scheduled** has no scheduler yet (always empty); Unread is derived from last-opened time per project.
- **Timeline Read steps** come from the transient agent-loop steps; they are not persisted across reloads (P1: persist agent steps on the message).
- **Tips & tricks / Language** are stored preferences; no localized strings or tip surface ship yet.
- **OKLCH**: the production CSS minifier rewrites `oklch()` to `lab()` (visually identical); tests compare resolved colours.
- **Account switching** is local-profile only; real multi-account sessions need the optional OAuth providers.
- Test environment needs Node ≥ 22 and (for E2E) Chromium system libraries.

## Ground-truth audit v3.3.1 (verified against code + a real baseline run, not against older docs)
Baseline measured in a clean checkout: `verify:docs` ✓ · `tsc` ✓ · `eslint` ✓ · vitest **42 files / 573 tests** ✓ · `vite build` ✓ · Chromium e2e **182/182** after the two baseline fixes (was 173 of 175 reached).

| Claim (older docs) | Status | Evidence |
|---|---|---|
| Static Vite SPA, esbuild-wasm runtime, VFS in IndexedDB, checkpoints, locks | **VERIFIED** | `src/core/runtime/*`, `src/core/vfs/*`, runtime/vfs tests, e2e SaaS compile |
| 4 wire protocols (OpenAI/Anthropic/Gemini/Ollama) **streaming text** | **VERIFIED** | `src/core/ai/stream.ts`, `protocols.test.ts` |
| Provider-**native tool/function calling** | **MISSING** (Phase 2) | `agentLoop.ts` only parses XML tags (`<read_file/>`…) |
| In-browser **TypeScript type-check** of user code | **MISSING** (Phase 2) | esbuild strips types only; `typescript` is a devDependency used by tests (`templates.test.ts` tsc --strict), not shipped |
| Auto-heal loop (build errors + preview errors → AI) | **VERIFIED** (build + console errors) / **PARTIAL** (no network/DOM audit, no verified receipt) | `selfHeal.ts`, `agentLoop.ts` |
| Permissions: projectEdits, publishing | **VERIFIED** enforced via `gate()` (`ChatPanel.tsx`, `store/app.ts`) — but through toast/`confirm` style, not an inline card |
| Permissions: build, connectors | **PARTIAL** — stored/shown, not enforced (`store/prefs.ts`) |
| Symbol map / repo map context | **VERIFIED** (regex-level, not AST/BM25) — `repoMap.ts` |
| Truncated stream handling | **PARTIAL** pre-3.4: a cut-off file was discarded ("nothing was written"); fixed in Phase 1 |
| `/api/share`, deploy history/rollback, ERD, npm search UI, a11y panel, insights, leak scanner, `.env` editor | **MISSING** at 3.3.1 (Phases 3–5) |
| Header versions (README v2.1, PROGRESS v3.2, HANDOFF V3.2-M5) | **FIXED** in 3.3.1 and now enforced by `verify:docs` |
| Optional `functions/api/{auth,catalog,proxy}` | **VERIFIED** present; degrade gracefully when absent |
