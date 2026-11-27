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

### V3.0-M7 — E2E, screenshots, release
- `scripts/e2e.mjs` grows to 106 checks: native mobile (390×844: PWA meta/manifest, zero overflow on Home/drawer/Chat/Preview/Code/Project sheet/Publish sheet, drawer open+close, BottomSheet drag-dismiss, clean top bar, floating switcher, Visual Inspector sheet) and Lovable desktop (Home, collapsing sidebar, template filter + Preview + Remix, live esbuild-wasm compile, picker keyboard nav, Project Knowledge persisted across reload, SEO editor, inline SVG QR, Version Card + follow-up chips + 1-tap Restore) plus the full v2.1 zero-regression suite.
- Fresh audit screenshots in `DOCS/screenshots/v30-*.png`; audit fixes: Home screenshot scroll container, Publish tab strip scrolls instead of clipping, duplicate inspector header removed on the sheet.
- Release 3.0.0.

### V3.1-M1 — OKLCH depth system, Geist, multi-ring shadows, SVG Aurora
- `src/index.css`: semantic OKLCH ladder (`--bg-depth/base/primary/secondary/muted/translucent`, `--fg-*`, `--border-depth`, `--bg-accent`), legacy `--c-*` tokens aliased onto it, 4 multi-ring shadows, calm motion curves, `.t-*` type scale, `.skel` shimmer. Geist / Geist Mono bundled (fallback Inter / JetBrains Mono).
- `store/theme.ts` + `AuroraBackdrop` + `AppearancePanel`: Dashboard Background presets (Classic Aurora, Soft Horizon, Warm Peach, Minimal Monochrome, Custom) persisted in `unq.theme.*`.

### ADR-018 Alias legacy tokens onto the OKLCH ladder
Rewriting 150+ components to new class names would risk regressions; aliasing `--c-bg/panel/subtle/raised/line/fg/muted/faint` gives the whole app the new depth instantly while new code uses `bg-primary`, `text-fg-tertiary`, `shadow-xs-surface`. Weight is applied via `font-variation-settings: "wght" 450` on body and reset to `normal` for bold/semibold/headings so Geist weights still work.

### V3.1-M2 — Native mobile navigation, launchpad, Projects & Chats views, skeletons
- Routes `#/`, `#/projects`, `#/chats`, `#/p/:id` (`parseRoute` now returns `view`); `MobileBottomNav` floating pill on <768px; header = Workspace Switcher pill + account avatar (`useApp.sheet` / `openSheet`).
- Home launchpad on mobile: composer at optical centre `bottom: calc(55dvh - var(--composer-height) - 14px)` (measured by ResizeObserver), `+` menu (Attach · Import project · Add context · Databases), `Build ▾` mode popover (Build / Chat [Free] / Plan), inverse 36px send.
- `ProjectsView`, `ChatsView` (filters All/Unread/Scheduled/Archived; `ProjectMeta.archived`), `Skeleton` loaders (280ms on view switch, plus Suspense/workspace loading), desktop sidebar gains Home/Projects/Chats links.

### V3.1-M3 — Swipe workspace, inset desktop canvas, chat polish
- `workspace/Body.tsx`: mobile workspace is a `100dvw` horizontal **scroll-snap strip** (Chat ⟷ Preview), no bottom tab bar; `useApp.mobilePane` mirrors scroll position; `requestTab` glides programmatically. Code mode keeps a floating `‹ Studio` pill and an `Open code` overflow item.
- Mobile top bar: 44px Close (X), centred project pill, 44px `›/‹` arrow. `MobilePreviewBar`: `‹ Chat`, `Click to add`, `…` overflow (Refresh, Change page, History, Share, Social & search, Preview in new tab), blue Publish.
- Desktop: `SplitPane` gains `minPx/maxPx/inset` (chat rail 30%, 320–768px, 8px hit seam); preview lives in an 8px `--bg-depth` gutter with 16px radius, hairline border and xl shadow; top bar segmented Preview | Code and 32px blue Publish.
- Chat: user bubble `24px/4px` radius on `bg-secondary`; AI prose `16/22 max-w-788`; follow-up chips are a 32px horizontal scroller above the composer.

### V3.1-M4 — Agent transparency (Timeline | + Changes)
- `core/ai/activity.ts` (pure, tested): Timeline (Thought for Xs, Read, Created/Edited/Deleted, Typecheck / Build, Questions answered), Changes (applied ops with before/after) and the `Worked for Xm Xs · N steps · N tokens` summary.
- `ui/chat/ActivityInspector.tsx` opened via `useApp.openActivity(id, tab)` from the quiet `Used X tools ›` row and the Version card's **Details** button; Changes cards expand into a syntax-coloured, line-numbered green/red diff with View file + copy path.
- Version card restyled (`bg-primary rounded-xl 1px --border-depth`) with Details · Preview · Restore.

### V3.1-M5 — Account menu, preferences, connectors hub, workspace settings
- `store/prefs.ts` (`unq.prefs`): language, chat suggestions, tips, **message queue** (ChatPanel queues sends while busy and auto-runs them, Composer `queueing`), **generation-complete sound** (Web Audio chime), global Instructions, Memory, and 3-state **agent permissions** (`gate()` enforced for *Project edits* and *Publishing*; *Build/Auto-heal* and *Connectors* are stored and surfaced for the agent/connector UI).
- `core/ai/userContext.ts` injects Instructions + Memory + enabled Skills into every prompt (`prompts.ts`). Skills live in IndexedDB `unq-skills` (`core/skills.ts`).
- `AccountMenu`, `AccountSettings`, `ConnectorsHub`, `WorkspaceSettings` are driven by `useApp.sheet` and mounted in `App.tsx`.

### ADR-019 Personalization context lives in core/ as a plain module
`prompts.ts` must not import stores; the prefs store pushes into `core/ai/userContext.ts` on every change (`subscribe`).

### V3.1-M6 — Chromium E2E, visual QA, release 3.1.0
- `scripts/e2e.mjs`: 147 checks (v2.1/v3.0 suite adapted to the new shell + a v3.1 section: OKLCH tokens resolved by colour (the production CSS minifier serialises `oklch()` as `lab()`, so tokens are compared by resolved pixels, not text), Light/Dark, Dashboard Background, mobile pill dock, skeleton, Projects/Chats filters, scroll-snap swipe, preview bar, Timeline/Changes diff, Account settings, Connectors, inset desktop canvas, hover-only cards, zero overflow, zero console errors).
- Fresh `DOCS/screenshots/v31-*.png` inspected; visual fixes: preview-bar pills no longer wrap, launchpad regained the template chip row.
- Baseline repair: upstream commit `fdcf855` had overwritten `src/lib/qrcode.ts` with its test file; the implementation was restored and the jsqr-free test moved to `qrcode.test.ts`.
- Release 3.1.0.

### V3.2-M1 — Glass theme, custom Select + Color Studio, haptics opt-in
- New glass design system in `src/index.css` (`.glass`, `.glass-pop`, `.glass-sheet`, `.glass-pill`, `.glass-field`: `blur(18px) saturate(160%)`, hairline luminous `oklch` border, inner top highlight) applied to composers, bottom-nav pill, modals/drawers, bottom sheets and popovers in Light + Dark.
- Accent moved from ember-orange to refined indigo (`#5b5bd6` / dark `#8f8cff`); neutral ramp tinted to hue 275; Aurora presets re-tuned (no pink/orange clashes); default custom gradient is blue→violet.
- `SelectSheet` replaces native `<select>` (Settings category switcher, Language, MCP transport, Inspector weight, Git tab via API-compatible `Select`).
- `ColorStudio`/`ColorField` replace every `<input type=color>` (Appearance, Theme Studio, Custom Provider, Inspector, Features).
- Haptics are strictly opt-in and OFF by default (`unq.haptics === '1'`); sheet drag no longer vibrates.
- ADR-020: native form controls are banned in UI code; use SelectSheet / ColorField.

### V3.2-M2 — Calm model picker, official full-colour icons, full-sheet swipe physics
- `ModelPicker` (still `src/ui/chat/ModelPicker.tsx`): new default **Recommended** tab grouped by purpose (`modelGroups.ts`); rows show only logo + name + ONE subtle capability pill (or the active check); context/cost/vision/tools badges removed; star only on hover/when favourited.
- Icons: `scripts/gen-brand-svgs.mjs` now emits `BRAND_COLOR_SVGS` (official multi-colour artwork), `BRAND_HEX` (official hex for single-path marks) and 10 connector brands (GitLab, Cloudflare Pages, Netlify, Supabase, Firebase, Stripe, Neon, Upstash, Resend, Clerk) via devDependency `simple-icons`. `BrandGlyph` never forces greyscale; only black-by-design marks (`ink`: GitHub, Vercel, xAI, Ollama, Resend, Moonshot) follow the text colour. CDN fallback tries `-color.svg` first and only inverts the mono variant.
- `BottomSheet`: native `touchstart/move/end` (non-passive) full-sheet swipe — when the inner scroller is at `scrollTop<=0` a downward drag from anywhere translates the sheet with rubber-band resistance and dismisses past threshold/velocity; horizontal scrollers, sliders, inputs and `[data-no-sheet-drag]` never start a drag; momentum scrolling + `overscroll-behavior: contain` on `.sheet-scroll`.

### V3.2-M3 — Mobile swipe shell + real live template previews
- `MobileShell` (new, `src/ui/layout/`): below 768px App renders Home/Projects/Chats as three `scroll-snap-x mandatory` panes; swiping is native momentum scrolling, `MobileBottomNav` indicator follows the finger via `--nav-progress`, and the hash route is committed after the gesture settles (110 ms debounce, not while touching). Tab taps scroll smoothly. Inner horizontal scrollers keep their pan. No route skeleton flash on mobile.
- Home template cards are now `TemplateCard`: **real** compiled previews — `templatePreview.ts` builds the template with the in-browser esbuild engine (serial queue + session cache) and renders it in a `sandbox="allow-scripts"` `srcDoc` iframe laid out at 1280×800, scaled with `transform: scale()`, `pointer-events: none`, lazy via `IntersectionObserver`. The Preview modal shows the same frame, interactive. `TemplateArt` wireframes were deleted.
- ADR-021: swipe navigation uses native scroll-snap (compositor-driven) instead of JS touch tracking so nested scrollers never conflict.

### V3.2-M4 — Clean message stream, 2-row composer, / skills, working mic
- **Parser:** `MessageParser.parseMessageText(text, streaming)` splits assistant text into prose + tool segments. Handles `<|tool_call:start|>…<|tool_call:end|>` (JSON or loose), `<create_file|update_file|patch_file|delete_file>`, fenced and bare `<<<<<<< SEARCH / ======= / >>>>>>> REPLACE`, stray `</patch_file>`, unterminated blocks and half-typed tags while streaming. `MessageView` renders text through `AssistantText` → Markdown prose + collapsible `ToolCard`s (Create / Rewrite / Patch + Diff). Markdown gained real headings, blockquote, hr, tighter spacing, syntax-highlighted fences (`highlight.ts`) with Copy.
- **Composer:** unified balanced 2-row glass card (borderless auto-grow textarea `Ask for a change... (@ files, / skills)`; bottom bar: `+` menu · Mic · `Build ⌄` mode pill (Build/Plan/Ask) · model pill · circular inverse Send). Attach, Mention, Skills, Enhance and Rules moved into the `+` menu.
- **`/` Skills:** `SlashSkillsMenu` (built-in 8 + installed skills, fuzzy filter, ↑↓/Enter/Tab/Esc, touch). Selection becomes a removable pill (`useComposerSkills`); `chat.send` injects them into the prompt via `userContext.turnSkills` (“Active skills for THIS request”).
- **Voice:** `useVoiceInput` (Web Speech API) streams interim words into the textarea, pulsing `Listening…` pill, toast when unsupported or mic denied. `useSpeech.ts` removed.
