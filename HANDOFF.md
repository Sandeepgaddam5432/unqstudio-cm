# HANDOFF

**State:** V2-M1…M4 complete. Read `AGENTS.md` first.
**Next:** V2-M5 polish (README/CHANGELOG/ARCHITECTURE refresh, codemap store shapes) then V2-M6 Playwright E2E (`scripts/e2e.mjs`) + screenshots in `DOCS/screenshots/v2-*.png`.
**Gotchas:** tests need Node 22; Chromium needs system libs (apt: libnss3 libnspr4 libatk1.0-0 libgbm1 libasound2 …); run `npm run docs:map` + `npm run verify:docs` after file changes.
**Auth:** see `DOCS/05-AUTH-SEO-DEPLOY.md` §C. Env: `VITE_GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
