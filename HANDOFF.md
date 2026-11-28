# HANDOFF

**State:** v3.6.1 — `DOCS/10-100X-MASTER-ROADMAP.md` added (41 capabilities, frontier specs, audited status: 5 VERIFIED · 22 PARTIAL · 10 MISSING · 4 TRACK-B); v3.6.0 core logic still UI-unwired.
**Run everything:** `npm run verify:docs && npx tsc --noEmit && npm run lint && npm test && npm run build && npm run e2e`.
**E2E environment:** needs `npx playwright install chromium` and the system libs (libnss3, libnspr4, libatk1.0-0, libatk-bridge2.0-0, libgbm1, libxkbcommon0, libasound2, libxi6, …). Without root, unpack the `.deb`s into a folder and export `LD_LIBRARY_PATH`.
**Optional deployment config:** `VITE_SITE_URL` (custom domain; default https://unqstudio-cm.pages.dev), `VITE_GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (see `DOCS/05-AUTH-SEO-DEPLOY.md`).
**Next:** v3.7.0 — wire native tool calling + bundle/emit the TypeScript worker chunk + CodeMirror squiggles + auto-run verify + `✓ Verified` receipt (see `DOCS/10` §7). Known: `isDestructiveSql` does not exist yet; the production build emits no `typecheckWorker` chunk.

## Handoff — v3.3.0
- Mobile shell = `ui/primitives/SwipePager.tsx` (+ `pagerPhysics.ts`). Floating CTAs must read `usePaneActive()`. Never use `position: fixed` for pane headers; use `absolute`/`sticky` inside the pane.
- Sheets that need their own scroller use `BottomSheet fill` (`Dropdown sheetFill`); everything else keeps the default scrolling body. Dismiss-drag rule lives in `BottomSheet` (handle, or downward >12px started at scrollTop<=0).
- Custom providers: `viaProxy` on `CustomProvider`/`ProviderDef`; `pickFetch(viaProxy)` chooses the transport. Deploy `functions/api/proxy.ts` with the Pages project (no env vars needed). Optional follow-up: rate-limit by IP with a Pages KV/Turnstile if abuse appears.
- 3.3.1: both former e2e failures were fixed (test bugs, see DOCS/06 ADR-3.3.1-1). `E2E_ONLY=<section substring> npm run e2e` runs one section. `verify:docs` now inspects `git status` — edit the docs in the same working tree as the code.
