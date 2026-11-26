<p align="center"><img src="public/logo.svg" width="96" alt="UnQStudio logo"></p>

# UnQStudio · v2.1

**A 100 % static, client-side AI software-engineering studio.** Describe an app, bring your own LLM key, and watch it
compile with `esbuild-wasm` into a sandboxed live preview — no backend, no WebContainers, nothing leaves your device.
Deploys as a plain `dist/` folder on Cloudflare Pages.

![Studio Mode](DOCS/screenshots/studio.png)

| Studio Mode (default) | Code Mode (`⌘E`) |
|---|---|
| Chat-first: conversational AI, step cards, 1-click undo, Prompt Enhancer, live preview, click-to-edit inspector, Theme Studio, Publish | Full IDE on the same live state: explorer with file locks, CodeMirror 6, global search/replace, diff viewer, console, `@file` context, token inspector |

![Code Mode](DOCS/screenshots/code.png)

## Features

| Area | What you get |
|------|--------------|
| **Workspace** | Adaptive Studio ↔ Code shell, `⌘K` palette (files, actions, AI modes, models, templates, themes), inline project rename, undo/redo/checkpoints, light/dark (Obsidian / Paper) |
| **VFS** | IndexedDB multi-project file system, rename/move/duplicate/search, **file & folder locking** that blocks the AI, gzip **checkpoints** (restore, fork, diff), ZIP import/export, File System Access folder sync |
| **Runtime** | `esbuild-wasm` (bundled `.wasm` + CDN fallback), VFS resolver (`./`, `../`, `@/`, index/ext probing), CSS + Tailwind v4 browser runtime, npm via `esm.sh` with memory + IndexedDB cache, hot rebuild < 300 ms |
| **Preview** | Sandboxed iframe + `postMessage` bridge: console, errors, unhandled rejections, **Fix with AI**, responsive viewports, rotate, zoom, pop-out, screenshot, element inspector |
| **AI** | **300+ catalog providers** (4-source unified Model Catalog) + first-class **Custom Providers** over 4 wire protocols (OpenAI, Anthropic, Gemini, Ollama), Build / Plan / Ask modes, streaming artifact parser, `<think>` UI, **search/replace patches**, approval tray, Prompt Enhancer, vision, voice, `@file` pinning, rules library, chat fork, token & cost meter, encrypted key vault (PBKDF2 + AES-GCM) |
| **Leapfrog IDE** | **Auto-Heal Builds** (compile → feed exact errors back → green, 1-click Undo), Cursor-style **inline ⌘K AI edit** in CodeMirror (streamed diff, lock-aware, checkpointed), **Project Symbol Map** context (~60% fewer tokens) |
| **Templates** | 8 curated static templates (SaaS, dashboard, portfolio, storefront, AI chat, kanban, blog+docs, blank) — each compiled **and `tsc --strict`-checked** in CI |
| **Settings hub** | Categorised navigation — AI & Models (Providers Hub, Prompt Rules) · Workspace (Chat & Editor, Appearance) · Account (Sign In & Cloud Sync) · Integrations (Connections, Plugins & MCP) · System (Data & Storage, Debug & Logs) |
| **Publish** | ZIP, GitHub (import / push / Pages workflow), GitLab, Netlify, Vercel, Cloudflare Pages (+ Git-connect fallback), Supabase explorer + typed client |

## What's new in v2.1
- **Universal Model Catalog** — Provider Directory (300+ providers) + OpenRouter public API + LiteLLM model specs, merged fill-only with a bundled snapshot, an optional edge function and live per-key `/models`. Refresh any time with **Refresh Catalog**.
- **Zero broken icons** — bundled crisp SVG glyphs → preloaded CDN glyph → deterministic monogram; model-family detection (Claude inside OpenRouter shows Claude).
- **+ Add Custom Provider** — OpenAI / Anthropic / Gemini-native / Ollama-native protocols, custom headers, vault-encrypted keys, one-click *Test & Auto-Fetch Models*.
- **Linear-grade Model Picker** — fuzzy + capability search, favorites, recents, windowed rendering for 9,000+ models.
- **Dynamic SEO/AEO** — set `VITE_SITE_URL` and every canonical URL, sitemap, robots and `llms*.txt` follows on the next build.

## What was new in v2.0
- **Rock-solid model picker** — Floating UI anchoring (`autoUpdate` + flip/shift/size) on desktop, bottom-sheet drawer on mobile. The v1 scroll-detach bug is fixed at the root.
- **Zero-overlap chat** — strict 3-zone grid (`auto minmax(0,1fr) auto`) in `100dvh`, wrapping composer toolbar, chat customization popover (density, font size, reasoning, badges, activity cards, auto-scroll), mobile bottom nav.
- **Universal model registry** — 300+ providers / ~9k models via build snapshot → edge function → live per-provider `/models` auto-fetch on key entry. Honest tags: Browser-Ready · Local · Requires Proxy.
- **Official brand + SEO/AEO** — logo, JSON-LD (SoftwareApplication, Organization, WebSite, FAQPage), `llms.txt`, `llms-full.txt`, sitemap, robots, PWA manifest.
- **Optional sign-in & free cloud sync** — Google (GIS, Drive AppData) and GitHub (Pages Function OAuth, Gist). Guest mode always works; GitHub OAuth also powers import/push/Pages deploy.
- **Living docs** — [`AGENTS.md`](./AGENTS.md) + eight code-level references in [`DOCS/`](./DOCS), enforced by `npm run verify:docs`.

## Quickstart

```bash
npm install
npm run dev          # http://localhost:5173
npm run test         # 353 unit tests (vitest, Node >= 22)
npm run verify:docs  # doc-sync guard (also: npm run docs:map to regenerate the code map)
npm run sync:catalog # refresh public/catalog-snapshot.json: directory + OpenRouter + LiteLLM (alias: sync:models; runs on prebuild)
npm run gen:seo      # rewrite canonical URLs from VITE_SITE_URL (runs on prebuild)
npm run lint && npm run typecheck
npm run build        # static bundle in dist/
npm run preview      # serve dist/
npm run e2e          # headless Chromium suite against dist/ (layout, picker, custom providers, icons, inline edit, SEO, auth, regression; run `npm run build` first, needs `npx playwright install chromium`)
```

On first use press the model pill → **Quick setup**, pick a provider (OpenRouter, Gemini, Groq, Cerebras and GitHub Models have free tiers) and paste a key.

## Architecture

```
┌──────────────────────────── src/ui  (React 19 + Tailwind v4 + Zustand) ────────────────────────────┐
│  Home · Studio · Code Mode (inline ⌘K) · Settings hub · Publish hub · Palette · Model Picker · icons │
└───────┬───────────────────┬────────────────────┬─────────────────────┬──────────────────────────────┘
        │                   │                    │                     │
  core/vfs/            core/runtime/        core/ai/              core/deploy/
  IStorageAdapter      IRuntimeEngine       4 wire protocols ·    GitHub · GitLab · Netlify
  IndexedDB · locks    EsbuildWasmEngine    catalog enricher ·    Vercel · Cloudflare ·
  checkpoints · zip    plugins · preview    stream · parser ·     Supabase (all REST,
                       bridge               self-heal · vault     browser → API)

  OPTIONAL edge (Cloudflare Pages Functions, zero Node deps) — the app works fully without it:
  functions/api/catalog.ts (+ models-dev alias)  ·  functions/api/auth/*  (GitHub OAuth code exchange)
```

Deep docs: [AGENTS.md](./AGENTS.md) · [01 Architecture](./DOCS/01-SYSTEM-ARCHITECTURE.md) · [02 Codebase map](./DOCS/02-CODEBASE-MAP.md) · [03 Models & AI](./DOCS/03-MODELS-AND-AI-ENGINE.md) · [04 UI & design system](./DOCS/04-UI-AND-DESIGN-SYSTEM.md) · [05 Auth/SEO/Deploy](./DOCS/05-AUTH-SEO-DEPLOY.md) · [06 Changelog & ADRs](./DOCS/06-CHANGELOG-AND-ADRS.md) · v1 notes: [ARCHITECTURE.md](./ARCHITECTURE.md) · [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) · [DOCS/FEATURES.md](./DOCS/FEATURES.md) · [DOCS/DEPLOYMENT.md](./DOCS/DEPLOYMENT.md)

## Deploy to Cloudflare Pages (static)

1. Push this repo to GitHub. 2. Cloudflare → Workers & Pages → Create → Connect to Git. 3. Build command `npm run build`, output `dist`. 4. Deploy.
`public/_redirects` and `public/_headers` are already configured. Custom domain? Set `VITE_SITE_URL=https://yourdomain.com` in Cloudflare Pages → Environment Variables and redeploy — canonical URLs, Open Graph, JSON-LD, `robots.txt`, `sitemap.xml` and `llms*.txt` all update automatically (`scripts/gen-seo-assets.mjs`). Full guide: [DOCS/DEPLOYMENT.md](./DOCS/DEPLOYMENT.md).

## Security & privacy

Provider API keys and custom-header values live in the **IndexedDB vault** on your device (optionally AES-GCM-256 encrypted with your passphrase via PBKDF2). OAuth tokens live **only in the tab's `sessionStorage`** (cleared when the tab closes, never persisted, never in backups). They are sent only to the provider/service you configure.
No telemetry, no server. The preview runs in an opaque-origin sandbox, so generated code can never read your keys.

## v3.0 highlights
Lovable-class studio: native mobile shell (draggable bottom sheets, sidebar drawer, floating Chat | Preview | Code bar, PWA), Home launchpad with live thumbnails and Templates & Showcase, inline Version Cards, follow-up chips, Plan card, route bar + visual click-to-edit, Project Knowledge, Publish sheet with QR + SEO editor, and a bounded multi-step agent loop. See `DOCS/` and `CHANGELOG.md`.
