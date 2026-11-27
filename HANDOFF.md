# HANDOFF

**State:** V3.2-M5 complete (connectors hub, custom connectors, Supabase full-stack engine). Next: M6 doc sync + Chromium E2E + screenshots. Read `AGENTS.md`, then `DOCS/09-UIUX-MASTER-SPEC.md` §11.
**Run everything:** `npm run verify:docs && npx tsc --noEmit && npm run lint && npm test && npm run build && npm run e2e`.
**E2E environment:** needs `npx playwright install chromium` and the system libs (libnss3, libnspr4, libatk1.0-0, libatk-bridge2.0-0, libgbm1, libxkbcommon0, libasound2, libxi6, …). Without root, unpack the `.deb`s into a folder and export `LD_LIBRARY_PATH`.
**Optional deployment config:** `VITE_SITE_URL` (custom domain; default https://unqstudio-cm.pages.dev), `VITE_GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (see `DOCS/05-AUTH-SEO-DEPLOY.md`).
**Next (P0):** agent tool loop, opt-in CORS relay, runtime-error capture in Auto-Heal (see `DOCS/08`).

## Handoff — v3.3.0
- Mobile shell = `ui/primitives/SwipePager.tsx` (+ `pagerPhysics.ts`). Floating CTAs must read `usePaneActive()`. Never use `position: fixed` for pane headers; use `absolute`/`sticky` inside the pane.
- Sheets that need their own scroller use `BottomSheet fill` (`Dropdown sheetFill`); everything else keeps the default scrolling body. Dismiss-drag rule lives in `BottomSheet` (handle, or downward >12px started at scrollTop<=0).
- Custom providers: `viaProxy` on `CustomProvider`/`ProviderDef`; `pickFetch(viaProxy)` chooses the transport. Deploy `functions/api/proxy.ts` with the Pages project (no env vars needed). Optional follow-up: rate-limit by IP with a Pages KV/Turnstile if abuse appears.
- Known open items: desktop "v3 desktop Lovable" e2e step clicks "Project settings" and times out; OKLCH ladder token #7 mismatch (both pre-existing).
