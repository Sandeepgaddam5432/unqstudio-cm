# Changelog

## v3.5.0 — agent tools, real TypeScript checker, preview telemetry 2.0
- **Tool layer** (`src/core/ai/tools.ts`): 12 typed agent tools; native function-calling serialisation for openai/anthropic/gemini/ollama, native stream accumulation (parallel calls), XML fallback, parallel read-only batching, arg validation. *Not yet on the wire (PARTIAL).*
- **Real TypeScript checker** (`src/core/runtime/tsCheck.ts`, lazy `typecheckWorker.ts`, `typecheck.ts`): `typescript` is now a runtime dependency used only in the worker chunk. *Not yet called from UI/agent (PARTIAL).*
- **Preview Telemetry 2.0:** fetch/XHR interception (`network`), DOM & layout audit (`audit:run`/`audit:result`), Network tab in the Console drawer, `observePreview` (≤ 10 s window, instant first-error trigger).
- **Honest receipts + verify loop** (`src/core/ai/verifyLoop.ts`). *UI badge not wired (MISSING).*

## v3.4.0 — resilient streaming & resumable writes
- **Resilient streaming** (`src/core/ai/resilientStream.ts`): 28 s chunk-gap watchdog (separate 120 s first-token budget), automatic mid-file continuation (≤ 2, exponential back-off) with last-25-lines tail context and overlap-deduplicated stitching, tighter retry for files that failed before meaningful output, lock-aware recovery, abort-safe.
- **Partial salvage:** cut-off files become `interrupted` ops with the partial preserved; completed files are never discarded; `RecoveryCard` offers **Resume** and **Retry failed file only**; live status line (`Writing /src/App.tsx · 148 lines…`, `Stream stalled at line 148 — resuming automatically (1/2)…`).
- **Prompts:** strict patch-first for files > 40 lines + chunk-budget discipline.
- `ArtifactStreamParser.flushInterrupted()` — a dangling `<create_fi` fragment is never leaked into chat text.

## v3.3.1 — ground-truth audit + strict doc-sync law
- **Audit:** every status doc re-verified against code (see `DOCS/08` "Ground-truth audit v3.3.1"); stale v2.1 / v3.2 / V3.2-M5 headers fixed; overstated claims tagged `PARTIAL`/`MISSING`.
- **verify:docs v2:** version/header consistency across `package.json`, README, PROGRESS, HANDOFF, CHANGELOG + strict git-diff doc-sync (`--strict-diff[=ref]`): any `src/ functions/ scripts/` change without DOCS/06 + CHANGELOG + PROGRESS + HANDOFF (+ DOCS/02 for added/removed files) fails.
- **e2e baseline fixed:** desktop "Project settings" click (a Settings dialog opened by Enter on the picker's first row was blocking the toolbar) and the OKLCH ladder check #7 (stale accent expectation → `oklch(52% .19 277)`). `E2E_ONLY=<substring>` runs a single section.
- **AGENTS.md / CLAUDE.md:** Zero-Exception Micro-Change Rule + Anti-Hallucination Rule.

## v3.2.0 (in progress)
- **V3.2-M5** Full-colour Connectors Hub (14 brands), custom connectors, Supabase full-stack engine.
- **V3.2-M4** Zero tool-call/diff leaks, tool cards, 2-row composer, / skills picker, working mic.
- **V3.2-M3** Mobile swipe shell with synced pill; real iframe template previews.
- **V3.2-M2** Calm grouped model picker, official full-colour brand icons, full-sheet swipe-to-dismiss.
- **V3.2-M1** Glass design system, indigo accent, custom SelectSheet + Color Studio, haptics opt-in.

## v3.1.0
- Full release: OKLCH depth system, Aurora backgrounds, native mobile nav, swipe workspace, Timeline | + Changes, Account/Connectors/Workspace settings. 147-check E2E.

- **M5** Account menu, preferences (queue/sound), personalization, permissions, connectors hub, workspace settings.

- **M4** Timeline | + Changes inspector, Used X tools row, Details/Preview version cards.

- **M3** Swipe scroll-snap workspace, mobile preview bar, inset desktop canvas, bubble polish.

- **M2** Native mobile nav pill, optical-centre launchpad, Projects & Chats views, skeleton loaders.

## v3.1.0 (in progress)
- **M1** OKLCH depth ladder, Geist typography, multi-ring shadows, SVG Aurora hero and Dashboard Background presets.

## v2.1.0 — Universal AI Studio
- **M1** Zero-leak branding (Model Catalog / Provider Directory / All Providers) + 4-source unified catalog (live /models → Provider Directory → OpenRouter → LiteLLM, fill-only, fail-safe); `sync:catalog`, edge `/api/catalog` (+ `/api/models-dev` alias).
- **M2** Zero-broken-icon system: 35 bundled glyphs → preloaded CDN glyph → deterministic monogram; model-family detection.
- **M3** `+ Add Custom Provider`: OpenAI / Anthropic / Gemini-native / Ollama-native adapters, custom headers, vault-held secrets, Test & Auto-Fetch Models, full CRUD.
- **M4** Windowed Model Picker (favorites, recents, capability search), categorised Settings hub, Providers Hub sections.
- **M5** Auto-Heal Builds, inline ⌘K selection edit in CodeMirror, Project Symbol Map context.
- **M6** `VITE_SITE_URL` SEO/AEO generator; hardened code map (persistence inventory, class methods, 100% real purposes); `DOCS/07`, `DOCS/08`; stricter `verify:docs`.
- **M7** 68-check headless-Chromium E2E against `dist/`, fresh `v21-*` screenshots, honest benchmark audit.


(Full timestamped history and ADRs: [DOCS/06-CHANGELOG-AND-ADRS.md](./DOCS/06-CHANGELOG-AND-ADRS.md).)

## 2.0.0
- **M1** Floating UI model picker (desktop popover / mobile bottom sheet), 3-zone chat grid, zero-overlap composer, chat customization, mobile bottom navigation.
- **M2** models.dev registry (snapshot + edge + live per-provider `/models`), compatibility tags, dynamic OpenAI-compatible routing for any registry provider.
- **M3** Official logo + derived brand assets, SEO/AEO (JSON-LD, llms.txt, robots, sitemap, manifest), About & FAQ footer.
- **M4** Optional Google (GIS + Drive AppData) and GitHub (Pages Function OAuth + Gist) sign-in and cloud sync.
- **M5** Living documentation system: `AGENTS.md`, `CLAUDE.md`, `DOCS/01–06`, generated code map, `verify:docs` guard.
- **M6** Playwright E2E for layout/overlap, scroll anchoring, registry, SEO and auth UI + fresh screenshots.

## 1.0.0
First production release.
- **Workspace**: adaptive Studio / Code modes, command palette, themes (Obsidian Dark, Paper Light), responsive down to 375 px.
- **VFS**: IndexedDB projects, file/folder locks, compressed checkpoints (restore / fork / diff), ZIP import/export, local-folder sync, JSON backup.
- **Runtime**: esbuild-wasm pluggable engine, esm.sh packages with persistent cache, Tailwind v4 browser runtime, sandboxed preview + bridge, error banner with Fix-with-AI, viewports, screenshots.
- **AI**: 20 BYOK providers, Build/Plan/Ask, streaming artifact + patch protocol, reasoning blocks, approval tray, enhancer, vision, voice, @mentions, token/cost meter, encrypted vault, MCP connector probe.
- **Editor**: CodeMirror 6, explorer, search/replace, split/unified diff, visual click-to-edit inspector, Theme Studio.
- **Templates**: 8 static templates verified by compile + strict type-check tests.
- **Publish**: GitHub (import/push/Pages), GitLab, Netlify, Vercel, Cloudflare Pages (+fallback), Supabase explorer.
- **Quality**: 100+ unit tests, strict TypeScript, ESLint, headless Chromium E2E.

## 3.0.0
- Native mobile app shell, BottomSheet, PWA meta, haptics, Lovable Warm accent.
- Home launchpad, collapsible sidebar/drawer, project thumbnails, template showcase (Preview/Remix).
- Build activity card, inline Version Cards, follow-up chips, Plan card, Model Picker keyboard navigation.
- Preview route bar, viewport pills, visual inspector (popover / mobile sheet) with Ask-AI box.
- Project Settings hub (Project Knowledge, Version History, Integrations); Publish sheet with SVG QR + SEO editor.
- Multi-step agent loop (read/search/verify, 1–5 steps) and symbol/dependency graph.
- E2E: 106 checks incl. mobile 390×844 and desktop 1440×900.

## [3.3.0]
### Added
- `functions/api/proxy.ts` streaming CORS proxy (SSRF-guarded) + `src/services/llm` client routing and URL normalisation; "Route via UnQStudio CORS Proxy" toggle for custom providers.
- `SwipePager` (transform track, spring physics), `NewProjectSheet`, `MobileHome`, `startProjectFromPrompt`.
### Changed
- Mobile Home is a single zero-scroll screen; templates live under Projects → New project. One floating CTA per tab. Model selector: no autofocus, one scroller, opaque header, de-duplicated catalog, 5 tabs. Assistant header: hammer badge replaced by a quiet brand dot.
### Fixed
- Home "Hi" no longer lands on an empty Preview with the message dropped; send without a key keeps the message and shows an actionable error.
- Header/FAB overlap while swiping; model picker could not be touch-scrolled; composer model pill overflowing onto Send.
