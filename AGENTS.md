# AGENTS.md — Constitution for every AI agent and developer working on UnQStudio

UnQStudio is a **static, browser-native AI coding studio** (React 19 + Vite + Tailwind 4 + esbuild-wasm), deployed on Cloudflare Pages with a handful of optional edge functions. All user data lives in the browser (IndexedDB / localStorage); API keys are BYOK and encrypted with Web Crypto AES-GCM.

## Mandatory reading order (BEFORE editing any code)
1. `AGENTS.md` (this file)
2. `DOCS/01-SYSTEM-ARCHITECTURE.md` — layers, ports/interfaces, data flows
3. `DOCS/02-CODEBASE-MAP.md` — every file and exported symbol (generated)
4. Then the topical doc: `03` AI/models, `04` UI/design system, `05` auth/SEO/deploy, `06` ADRs/changelog, `07` VFS/runtime/deploy contracts, `08` honest improvements & roadmap, `09` **UI/UX master spec (v3.1: OKLCH depth, mobile nav, swipe workspace, Timeline/Changes, Settings suite — mandatory before any UI work)**.

## IMMUTABLE DOC-SYNC LAW
Whenever you **add, rename, delete a file**, or **change its exports, store state, persisted keys or an HTTP API**, you MUST — *before committing*:
1. Add a purpose line for new files in `scripts/codemap-purposes.mjs`, then run `npm run docs:map` to regenerate `DOCS/02-CODEBASE-MAP.md`.
2. Update the relevant hand-written doc(s) (`DOCS/01`, `03`, `04`, `05`).
3. Append an entry to `DOCS/06-CHANGELOG-AND-ADRS.md` (and an ADR if a design decision was made).
4. Update `PROGRESS.md` and `HANDOFF.md`.
5. Run `npm run verify:docs` — it must pass. It is a **mandatory pre-commit quality gate** (it fails on undocumented, stale or out-of-date files).

## Quality gates (all must pass before every commit)
`npm run verify:docs` · `npx tsc --noEmit` · `npm run lint` · `npm run test` · `npm run build` (and `npm run e2e` for UI-affecting work). Tests need Node ≥ 22 (jsdom 31).

## Engineering rules
- **No hard-coded model lists as the primary mechanism.** Models come from live per-provider `/models` → the 4-source unified Model Catalog (Provider Directory + OpenRouter + LiteLLM) → bundled snapshot (see `DOCS/03`). User-facing UI text must NEVER name the upstream directory (tests enforce it).
- **Local-first, zero forced login.** Guest mode must always work. Auth is optional and must degrade gracefully when env vars are unset.
- **Never commit secrets.** No tokens in source, `.env`, docs, git history or `.git/config`. Push with ephemeral `http.extraheader` auth only.
- Layering: `ui → store → core`. `core/*` never imports from `ui/*`. Runtime/storage/auth are ports (`IRuntimeEngine`, `IStorageAdapter`, `IAuthProvider`).
- Layout rules: every chat/workspace container uses `min-w-0` and `overflow-x-hidden`; the chat is a 3-row grid `auto minmax(0,1fr) auto` inside `h-[100dvh]`. Popovers use Floating UI (`Dropdown`) — never hand-computed `position: fixed` rects.
- Edge functions (`functions/`) use only standard Web APIs (Fetch, Crypto) — zero Node dependencies.
