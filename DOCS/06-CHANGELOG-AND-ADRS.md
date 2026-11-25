# 06 · Changelog & Architecture Decision Records

## Changelog

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
