# HANDOFF

**State:** v3.5.0 — Phase 2 core complete (tools, TS checker, preview telemetry, receipts) — UI/agent wiring PARTIAL. See `DOCS/08` tables.
**Run everything:** `npm run verify:docs && npx tsc --noEmit && npm run lint && npm test && npm run build && npm run e2e`.
**E2E environment:** needs `npx playwright install chromium` and the system libs (libnss3, libnspr4, libatk1.0-0, libatk-bridge2.0-0, libgbm1, libxkbcommon0, libasound2, libxi6, …). Without root, unpack the `.deb`s into a folder and export `LD_LIBRARY_PATH`.
**Optional deployment config:** `VITE_SITE_URL` (custom domain; default https://unqstudio-cm.pages.dev), `VITE_GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (see `DOCS/05-AUTH-SEO-DEPLOY.md`).
**Next:** resilient streaming (Phase 1) → native tool loop + TS worker (Phase 2) → brain/safety (3) → UI (4) → full-stack (5). See `DOCS/08`.

## Handoff — v3.3.0
- Mobile shell = `ui/primitives/SwipePager.tsx` (+ `pagerPhysics.ts`). Floating CTAs must read `usePaneActive()`. Never use `position: fixed` for pane headers; use `absolute`/`sticky` inside the pane.
- Sheets that need their own scroller use `BottomSheet fill` (`Dropdown sheetFill`); everything else keeps the default scrolling body. Dismiss-drag rule lives in `BottomSheet` (handle, or downward >12px started at scrollTop<=0).
- Custom providers: `viaProxy` on `CustomProvider`/`ProviderDef`; `pickFetch(viaProxy)` chooses the transport. Deploy `functions/api/proxy.ts` with the Pages project (no env vars needed). Optional follow-up: rate-limit by IP with a Pages KV/Turnstile if abuse appears.
- 3.3.1: both former e2e failures were fixed (test bugs, see DOCS/06 ADR-3.3.1-1). `E2E_ONLY=<section substring> npm run e2e` runs one section. `verify:docs` now inspects `git status` — edit the docs in the same working tree as the code.
