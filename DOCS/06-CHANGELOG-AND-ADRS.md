# 06 · Changelog & Architecture Decision Records

## Changelog

### v2.0 — V2-M6 · Playwright E2E + visual audit
- `scripts/e2e.mjs` rewritten: 78 checks at 1440×900, 768×1024 and 375×812 — dropdown anchoring (scroll, resize, trigger movement), mathematical zero-overlap + zero-horizontal-overflow audit of chat header/messages/composer/every toolbar button, bottom-sheet behaviour, registry + live `/models` fetch (mocked), SEO/AEO assets, auth UI, v1 regression (SaaS compile in sandboxed iframe, Ctrl+E, theme, palette), zero console errors.
- Bugs found and fixed by the audit: chat header overflow in narrow split panes (container query `@lg`), mobile top-bar title collision with the Studio/Code switch (hidden <768px; bottom nav replaces it).
- Fresh screenshots: `DOCS/screenshots/v2-home.png`, `v2-studio-desktop.png`, `v2-mobile-chat.png`, `v2-models-picker.png` (+ `v2-mobile-picker.png`).

### v2.0 — V2-M5 · Living documentation system
- `AGENTS.md`/`CLAUDE.md` constitution with the immutable Doc-Sync Law; DOCS/01–06 complete.
- `scripts/gen-codemap.mjs` now also embeds Zustand state shapes; `verify:docs` checks presence, undocumented/stale files and that the generated map is current.
- README/CHANGELOG refreshed; v1 ARCHITECTURE/DESIGN_SYSTEM marked superseded.

### v2.0 — V2-M4 · Optional Google/GitHub auth + free cloud sync
- Google GIS token client + Drive AppData sync; GitHub OAuth Pages Function + Gist sync; session-only tokens; GitHub token auto-injected into import/push/Pages deploy.
- AccountPill, AuthModal with honest unconfigured state and 3-step setup guide. 21 new unit tests.

### v2.0 — V2-M3 · Official logo, brand assets, SEO & AEO
- Official `logo.svg` integrated (TopBar, Home, Settings header, README); derived favicon/touch/PWA icons and 1200×630 OG card.
- index.html: full meta + 4 JSON-LD blocks; robots.txt, sitemap.xml, llms.txt, llms-full.txt, manifest.webmanifest.
- Home: semantic landmarks + collapsible About & FAQ footer. Tests in `seo.test.ts`.

### v2.0 — V2-M2 · models.dev universal registry + live model auto-fetch
- 3-tier discovery: build snapshot (`public/models-registry.json`, 327 providers / 9.4k models), edge function `/api/models-dev`, live per-provider `/models` fetch on key entry.
- Compatibility tagging (Browser-Ready 🟢 / Local 💻 / Requires Proxy 🔌) with filter tabs in picker and Providers settings.
- Any models.dev provider works immediately through the universal OpenAI-compatible adapter.
- `prebuild` runs `sync:models` (offline-safe). 19 new unit tests (`models.test.ts`).

### v2.0 — V2-M1 · Model dropdown anchoring, chat grid, UI polish
- `Dropdown` rebuilt on `@floating-ui/react` (autoUpdate/offset/flip/shift/size, portal) with mobile bottom sheet. Fixes the scroll-detach bug.
- Chat panel refactored to a strict 3-zone grid; composer toolbar wraps below the textarea; added `@file` button.
- Chat customization popover + persisted `useChatPrefs`.
- Mobile bottom navigation `Chat | Preview | Code`; workspace root `h-[100dvh]`.
- Added doc-sync infrastructure: `scripts/gen-codemap.mjs`, `scripts/verify-docs.mjs`, `AGENTS.md`, `CLAUDE.md`.

### v1.0 — M1…M8
Scaffold, VFS, esbuild-wasm runtime, multi-LLM orchestrator, Code Mode, 8 templates, deploy hub, Supabase explorer, E2E suite (see git history `feat(m1)`…`feat(m8)`).

## ADRs

### ADR-001 Floating UI instead of hand-rolled popover positioning
Hand-computed rects go stale on scroll; Floating UI's `autoUpdate` is the proven solution and also gives flip/shift/size. Accepted cost: ~10 KB gz.

### ADR-002 Generated code map + verify gate
Hand-maintained symbol docs rot. `scripts/gen-codemap.mjs` derives files, exports, imports, stores and persistence keys from source; `verify:docs` fails the commit when it drifts, making the docs self-enforcing for humans and agents.

### ADR-003 Wrapping toolbar instead of overlay composer
Absolute/overlay actions collide at narrow widths. A `flex-wrap` toolbar below the textarea cannot overlap by construction.

### ADR-004 Shared import-free normalizer instead of three copies
The Node script, the edge function and the browser all need the same models.dev → registry mapping. `modelsDev.ts` has zero imports so the `.mjs` script can transpile it with `esbuild-wasm` (already a dependency) and import it — no extra tooling (tsx/ts-node), no drift.

### ADR-005 Registry providers are opt-in, built-ins keep their ids
Showing 300+ providers in the picker is noise; registry providers default to disabled until a key/enable. Built-in ids (`gemini`, `together`…) are aliased to models.dev ids (`REGISTRY_ALIAS`) so previously saved keys are not orphaned.

### ADR-006 Honest `requires-proxy` instead of silent failure
Bedrock/Vertex/Azure need IAM/signed requests; calling them with a bearer key from a browser fails opaquely. They are tagged and blocked with an explanation rather than offered as selectable.

### ADR-007 Edge normalization is best-effort
Parsing the 7 MB upstream may exceed Free-plan CPU budgets on a cold edge. The client therefore treats the edge as one tier of three (edge → direct models.dev → bundled), validates the response shape, and caches 24h.

### ADR-008 SEO via static text + JSON-LD, not SSR
The app is a client-rendered SPA; prerendering would add a server/build step. Crawlers and answer engines get the same facts from `<noscript>`, JSON-LD, `llms*.txt` and the in-DOM About & FAQ, keeping the architecture fully static.

### ADR-009 Tokens in sessionStorage, not localStorage/vault
OAuth tokens are bearer credentials with broad scopes (`repo`, `gist`). Keeping them tab-scoped limits the blast radius of XSS persistence and keeps them out of backups; the cost is re-sign-in per session, which is one click.

### ADR-010 GitHub via edge function, Google via pure client
GitHub's web flow requires a client secret, so the code exchange must run server-side (Pages Function). Google's GIS token client needs no secret, so it stays 100 % static.

### ADR-011 Sync payload excludes the vault
Uploading even an encrypted vault to third-party storage creates an offline brute-force target. Sync carries projects/chats/settings only; API keys are re-entered per device.

## v2.1 — Universal AI Studio (in progress)

### V2.1-M1 — Zero-leak branding + 4-source unified Model Catalog
- User-facing UI, `index.html` FAQ/JSON-LD and `public/llms*.txt` no longer name the upstream directory: labels are **All Providers**, **Model Catalog**, **Provider Directory**, **Catalog synced**, **Refresh Catalog**. A Vitest suite scans every `src/ui` file and the SEO assets for the forbidden brand.
- Catalog = P1 live per-provider `/models` → P2 Provider Directory → P3 OpenRouter public API → P4 LiteLLM model specs (`src/core/ai/catalogEnricher.ts`). Enrichment is **fill-only**; each source fails independently; bundled `public/catalog-snapshot.json` is the floor.
- `scripts/sync-models-dev.mjs` → `scripts/sync-catalog.mjs` (`sync:models` kept as alias); `public/models-registry.json` → `public/catalog-snapshot.json`; edge `/api/catalog` (+ `/api/models-dev` alias).

**ADR-V21-1 — Four-source catalog, fill-only merge.** Context: a single registry lags same-day launches and misses pricing/limits. Decision: directory = identity/endpoints (wins), OpenRouter = new models + capabilities, LiteLLM = pricing/limits. Never override higher-priority fields; skip any failed source. Consequence: catalog is always ≥ snapshot, ~9k models, no hard dependency on any one upstream.

### V2.1-M2 — Guaranteed icons for every provider and model
- `src/ui/icons/*`: `ProviderIcon`, `ModelIcon`, `detectModelFamily` (38 pattern tests), 35 bundled glyphs, monogram fallback. Replaced the raw `<img src={logo}>` in `ProvidersTab`.

**ADR-V21-2 — Three-layer icons, preload-then-render.** Context: remote logos 404 / are blocked, leaving broken-image glyphs. Decision: bundle the top brands; for the rest preload the remote candidate and only mount it after it decodes; otherwise a deterministic monogram. Consequence: zero broken images by construction (verified in E2E: every `img` has `naturalWidth > 0`); +~42 KB (≈11 KB gzip) source for glyphs.

### V2.1-M3 — First-class custom providers, 4 wire protocols
- `stream.ts`: native Gemini (SSE) + Ollama (NDJSON) adapters, Anthropic base normalisation + browser-access toggle, custom headers merged everywhere; `modelFetcher.liveEndpoint` covers all four `/models` shapes; `listModels` now delegates to it.
- `CustomProviderModal` / `CustomProviderCards` + `useCustomProviders` store; vault-held key + headers; Test & Auto-Fetch with live preview.

**ADR-V21-3 — Protocol = ProviderKind; secrets only in the Vault.** Context: “custom” was OpenAI-only and headers were static. Decision: one discriminated `kind` selects request builder + parser + models endpoint; custom provider records hold no secrets; header values (often tokens) are encrypted like keys. Consequence: adding a 5th protocol is one builder + one parser + one `liveEndpoint` branch.

### V2.1-M4 — Picker & Settings reorganisation
- ModelPicker rewritten around a windowed flat row list (ADR-V21-4), favorites/recents, capability search, icons + chips, skeleton rows, Add Custom Provider footer. Settings → grouped nav; Providers Hub sections; new Account tab.

**ADR-V21-4 — Hand-rolled fixed-height windowing, no virtualization dependency.** Context: 327 providers × ~30 models froze the old grouped DOM list. Decision: flatten to rows of constant height and render `slice(first,last)` with absolute `translateY`; no new dependency (a 30-line window beats `react-virtual` for a constant row height). Consequence: O(visible) DOM; rows must stay 36px (variable height would need measurement).

### V2.1-M5 — Leapfrog IDE features
- Auto-Heal Builds (default on; Settings → Chat & Editor, quick toggle in Chat settings), inline ⌘K edit in CodeMirror, Project Symbol Map in `buildProjectContext`.

**ADR-V21-5 — Self-heal = bounded, observable, undoable.** Context: the old auto-fix fired a blind 5 s timer. Decision: wait for the actual compile result, retry ≤3 with exact errors + excerpts, stop on green / no progress / abort, and keep a single Undo that rolls back the whole series. Consequence: heal turns appear in chat (transparent) and cost tokens; users can disable or cap them.
**ADR-V21-6 — Symbol map instead of embeddings.** Context: no backend, no vector DB. Decision: regex export/import extraction (no parser dependency, ~1 ms for 100 files); full text only for pinned/mentioned/entry files. Consequence: approximate (re-exports via `export *` are not resolved) but deterministic, offline and ≥60% cheaper on mid-size projects.

### V2.1-M6 — SEO generator + documentation gaps
- `scripts/gen-seo-assets.mjs` (`prebuild`, `gen:seo`) driven by `VITE_SITE_URL`; code map now lists every IndexedDB database/store/index, all `sessionStorage` + `localStorage` keys, public class methods, never lists template-literal text as exports, and has a real purpose for 100% of files; `DOCS/07` written; `DOCS/04` bridge contract + colour tokens synced to the code; README/DOCS 05/DEPLOYMENT corrected; `verify:docs` fails on lazy purposes, missing DOCS 01–08, undocumented bridge events or missing `VITE_SITE_URL` docs.

**ADR-V21-7 — Detect-and-replace canonical origin.** Context: the canonical URL is hard-coded in 6 static files. Decision: keep committed, working files and rewrite the *detected* current origin at `prebuild` from `VITE_SITE_URL` (no template placeholders, so `vite dev` and raw `index.html` stay valid). Consequence: idempotent, reversible, zero code changes for a custom domain; the rewrite touches the working tree at build time only.

### V2.1-M7 — Verification
- `scripts/e2e.mjs`: 68 checks in headless Chromium against `dist/` — zero upstream-brand text, zero broken images, 4-protocol custom-provider flow with mocked live `/models`, favorites + windowed scroll, inline ⌘K, canonical/JSON-LD, theme, auth UI, chat zero-overlap at 1440 and 375, SaaS compile, zero console errors. Screenshots: `DOCS/screenshots/v21-*.png`. Honest audit in `DOCS/08`.

### V2.1-M7 visual-audit fix
- Screenshot review found the picker's metadata chips starving the model name in the 340 px panel and the list scrolling sideways. Fix: horizontal overflow hidden, capability chips are compact icon chips with titles, name has a 5 rem floor, desktop panel widened to 440 px.

## v3.0 — Lovable-class studio & native mobile UX (in progress)

### V3.0-M1 — Native mobile shell, draggable BottomSheet, PWA & visual elevation
- `BottomSheet` (spring physics in `sheetPhysics.ts`) now backs every `Modal`, `Drawer` and `Dropdown mobileSheet` below 768px (Model Picker, Publish, Settings, Project switcher).
- PWA shell: `viewport-fit=cover`, `apple-mobile-web-app-capable`, manifest `id`/`shortcuts`, theme-color synced to the active theme, safe-area CSS variables, no overscroll, 44px touch targets.
- `useVisualViewport` publishes `--kb-inset`; the workspace pads by it so the composer sits above the keyboard.
- `haptics.ts` + Appearance toggle; accent preset **Lovable Warm** (`data-accent="warm"`).
- Phone top bar = menu · Project Pill · Publish; floating `Chat | Preview | Code` bar with sliding indicator and build/error dot.

### ADR-012 One BottomSheet primitive instead of per-feature drawers
Modal/Drawer/Dropdown switch to the same sheet on phones so drag, scroll-lock and safe-area handling live in one tested place. Cost: Modal consumers get sheet chrome on <768px (title bar replaces the dialog header).

### V3.0-M2 — Lovable Home Launchpad, collapsible sidebar, live thumbnails
- `AppSidebar`: desktop rail (collapsed state persisted in `unq.app.v1`) and phone slide-over drawer with edge-swipe open / swipe-left or tap-outside close.
- Home: 'What should we build today?' hero with ambient mesh, floating composer (Build/Plan/Ask toggle, model pill, attach, mic, enhance), 1-tap starter chips, thumbnail project grid (star, Open/Rename/Remix/Project settings/Export ZIP/Delete) and Templates & Showcase (8 category pills, Preview, Remix).
- `ProjectMeta` gained `thumbnail`, `starred`, `knowledge`, `bookmarks` (IndexedDB schema unchanged: object store records are schemaless).
- Preview captures a thumbnail 1.5s after each successful build (≥15s apart) via the bridge `thumb:capture` layout snapshot, persisted by `persistThumbnail`.

### ADR-013 Thumbnails from a layout snapshot, not a pixel screenshot
The preview iframe is an opaque-origin sandbox, so canvas capture of its DOM is unreliable (tainting, `foreignObject` quirks, headless). The bridge instead walks computed styles (≤140 boxes) and the host renders an SVG (then WebP when the browser can). This works in every context, is escaped/sanitised, and is capped at 40k chars.

### V3.0-M3 — Signature Lovable chat UX
- `BuildActivityCard` (shimmer + live timer + steps), inline `VersionCard` (v1…, bookmark, Preview / Code·Diff / Restore with a safety checkpoint), `FollowUpChips` (deterministic, offline), Plan card with **Implement the plan** (flips to Build mode and sends).
- Model Picker keyboard navigation closes the DOCS/08 P1 a11y gap: combobox + `aria-activedescendant`, ArrowUp/Down (wrapping), Home/End, Enter, Escape and scroll-into-view in the virtual window.
- `useApp.requestTab('preview')` lets chat cards switch the phone view strip.

### ADR-014 Follow-up chips are rules, not a second LLM call
Chips must be instant, free and work offline on phones; a rule table over the project text is deterministic and unit-testable. Trade-off: less tailored than a model-written suggestion.

### V3.0-M4 — Preview canvas, route bar, mobile visual click-to-edit
- `PreviewToolbar`: back/forward/reload, editable route bar (hash or history routes via bridge `route:navigate|back|forward`; the bridge reports `route`), viewport pills with device frames, Visual edit pill, console badge, new tab and fullscreen (CSS fixed overlay, Esc exits).
- Inspector overlay is now signature blue `#3B82F6` with a tag + size badge. `VisualInspector` = Floating-UI popover (desktop) / modeless BottomSheet (phones); form adds font weight and an inline **Ask AI to edit this element** box that enqueues the DOM node, classes and source hint into chat.

### ADR-015 Route navigation by hash fallback
The preview is an opaque-origin `srcdoc` iframe where `history.pushState` to a path throws; the bridge therefore uses `pushState` only on http(s) documents (pop-out, tests) and `location.hash` inside srcdoc. Apps using hash routing (the templates) navigate; BrowserRouter apps are best-effort.

### V3.0-M5 — Project Settings hub, Project Knowledge, Publish sheet with QR
- `ProjectSettings` (Top-bar settings button, Project Pill sheet, Home card menu): Overview, **Project Knowledge** (`ProjectMeta.knowledge`, ≤ 8,000 chars, injected by `buildProjectContext` on every turn), Version History (bookmarks, compare, fork, restore with safety checkpoint), Integrations.
- `PublishSheet` replaces `PublishModal`: live URL (persisted in kv `liveUrl:<projectId>`), `src/lib/qrcode.ts` inline SVG QR, deploy targets, Share & SEO editor that rewrites `/index.html` through `core/deploy/seo.ts` (checkpointed).
- `jsqr` added (test-only use) to verify QR output with an independent decoder.

### ADR-016 Own QR encoder instead of a dependency
A QR encoder is ~200 lines, keeps the main chunk free of a library, and the correctness risk is covered by decoding real output with jsQR in CI. Limit: versions 1–10 (≤ 154 bytes at ECC M), enough for deploy URLs; longer input throws `RangeError` and the UI hides the QR.

### V3.0-M6 — Multi-step agent loop & upgraded symbol graph (closes DOCS/08 P0 #1, P1 #4 partially)
- `core/ai/agentLoop.ts`: after a Build turn applies edits, the loop verifies the real esbuild-wasm compile (`startWithVerify`), then runs up to `agentMaxSteps` (1–5, default 3, Settings → Chat & Editor) model turns. The model can emit `<read_file>`, `<list_files>`, `<search_project>`, `<verify_build>`; results return as OBSERVATIONS. File edits keep using the streaming XML artifact tags (locks enforced by `applyOp`). Steps stream into `BuildActivityCard`; the status pill's Stop and whole-turn Undo apply.
- `repoMap.ts` now reports component prop interface names (function, arrow, memo/forwardRef, `FC<Props>`), custom hooks vs zustand store slices, type aliases, re-exports and resolved local import edges (`Local import edges` block in the symbol map).

### ADR-017 Agent loop wraps `send()` instead of replacing the streaming orchestrator
The streaming parser, approval tray, usage metering and checkpoints all live in `runTurn`/`send`. The loop treats each `send` as one model step (edits are applied there), adds client-side read/search tools and build verification around it, and is testable in isolation through injected deps. Trade-off: tool tags are plain text rather than provider-native function calling (works on every provider/protocol).
