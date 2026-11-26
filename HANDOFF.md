# HANDOFF

**State:** V3.0-M6 complete (agent loop, symbol graph). Remaining: V3.0-M7 (E2E, screenshots, release docs).
**Run everything:** `npm run verify:docs && npx tsc --noEmit && npm run lint && npm test && npm run build && npm run e2e`.
**E2E environment:** needs `npx playwright install chromium` and the system libs (libnss3, libnspr4, libatk1.0-0, libatk-bridge2.0-0, libgbm1, libxkbcommon0, libasound2, libxi6, …). Without root, unpack the `.deb`s into a folder and export `LD_LIBRARY_PATH`.
**Optional deployment config:** `VITE_SITE_URL` (custom domain; default https://unqstudio-cm.pages.dev), `VITE_GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (see `DOCS/05-AUTH-SEO-DEPLOY.md`).
**Next (P0):** agent tool loop, opt-in CORS relay, runtime-error capture in Auto-Heal (see `DOCS/08`).
