# AGENTS.md — Constitution for every AI agent and developer working on UnQStudio

UnQStudio is a **static, browser-native AI coding studio** (React 19 + Vite + Tailwind 4 + esbuild-wasm), deployed on Cloudflare Pages with a handful of optional edge functions. All user data lives in the browser (IndexedDB / localStorage); API keys are BYOK and encrypted with Web Crypto AES-GCM.

## Mandatory reading order (BEFORE editing any code)
1. `AGENTS.md` (this file)
2. `DOCS/01-SYSTEM-ARCHITECTURE.md` — layers, ports/interfaces, data flows
3. `DOCS/02-CODEBASE-MAP.md` — every file and exported symbol (generated)
4. Then the topical doc: `03` AI/models, `04` UI/design system, `05` auth/SEO/deploy, `06` ADRs/changelog, `07` VFS/runtime/deploy contracts, `08` honest improvements & roadmap, `09` **UI/UX master spec (v3.1: OKLCH depth, mobile nav, swipe workspace, Timeline/Changes, Settings suite — mandatory before any UI work)**, `10` **100x master roadmap — the 41-capability matrix with honest per-capability status (read before planning any feature; update the matrix row whenever a status changes)**.

## IMMUTABLE DOC-SYNC LAW (zero-exception micro-change rule)
**Even a 1-line or 1-word change** that affects behaviour, UI copy/layout, CSS tokens, prompts, tools, the parser, store state, persistence keys, edge functions, scripts or a bug fix MUST update the matching docs **before committing**:
1. New/renamed/removed file or changed export/store shape/persisted key/HTTP API → add a purpose in `scripts/codemap-purposes.mjs`, run `npm run docs:map` (regenerates `DOCS/02-CODEBASE-MAP.md`).
2. The relevant topical doc(s): `DOCS/01`, `03`, `04`, `05`, `07`, `08`, `09`.
3. `DOCS/06-CHANGELOG-AND-ADRS.md` (+ an ADR for any architectural/UX decision), `CHANGELOG.md`, `PROGRESS.md`, `HANDOFF.md`.
4. Versions must agree everywhere: `package.json` ⇄ README H1 ⇄ PROGRESS H1 ⇄ HANDOFF `**State:**` ⇄ newest CHANGELOG heading (no stale headers/footers, no "(in progress)").
5. `npm run verify:docs` must pass. It **fails** on: missing/undocumented/stale files, out-of-date code map, lazy purposes, brand leaks, undocumented bridge events, **version drift**, and **any `src/ functions/ scripts/` change (tests exempt) without DOCS/06 + CHANGELOG + PROGRESS + HANDOFF (+ DOCS/02 for added/removed files)** — the diagnostic lists exactly which files to update. CI runs `node scripts/verify-docs.mjs --strict-diff=<base>`.

## ANTI-HALLUCINATION RULE
Never write that a feature "works", is "verified" or is "done" unless (a) a passing automated test covers it **and** (b) you observed the runtime behaviour (unit run, e2e, or screenshot). Otherwise tag it `PARTIAL` or `MISSING` (or `ENV-LIMITED` when it needs external credentials/bindings) in `DOCS/08`. Treat every pre-existing `.md` claim as unverified until checked against code. Report real gate numbers, never rounded-up ones.

## Quality gates (all must pass before every commit)
`npm run verify:docs` · `npx tsc --noEmit` · `npm run lint` · `npm run test` · `npm run build` (and `npm run e2e` for UI-affecting work). Tests need Node ≥ 22 (jsdom 31).

## Engineering rules
- **No hard-coded model lists as the primary mechanism.** Models come from live per-provider `/models` → the 4-source unified Model Catalog (Provider Directory + OpenRouter + LiteLLM) → bundled snapshot (see `DOCS/03`). User-facing UI text must NEVER name the upstream directory (tests enforce it).
- **Local-first, zero forced login.** Guest mode must always work. Auth is optional and must degrade gracefully when env vars are unset.
- **Never commit secrets.** No tokens in source, `.env`, docs, git history or `.git/config`. Push with ephemeral `http.extraheader` auth only.
- Layering: `ui → store → core`. `core/*` never imports from `ui/*`. Runtime/storage/auth are ports (`IRuntimeEngine`, `IStorageAdapter`, `IAuthProvider`).
- Layout rules: every chat/workspace container uses `min-w-0` and `overflow-x-hidden`; the chat is a 3-row grid `auto minmax(0,1fr) auto` inside `h-[100dvh]`. Popovers use Floating UI (`Dropdown`) — never hand-computed `position: fixed` rects.
- Edge functions (`functions/`) use only standard Web APIs (Fetch, Crypto) — zero Node dependencies.
