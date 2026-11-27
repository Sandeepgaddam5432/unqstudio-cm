# Changelog

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
