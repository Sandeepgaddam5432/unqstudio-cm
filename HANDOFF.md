# HANDOFF

**State:** V2-M1…M6 complete — all gates green (verify:docs, tsc, lint, 147 unit tests, 78 E2E checks, build). Read `AGENTS.md` first.
**Run everything:** `export PATH=<node22>:$PATH; npm run verify:docs && npx tsc --noEmit && npm run lint && npm test && npm run build && npm run e2e`.
**Environment notes:** unit tests need Node >= 22 (jsdom 31); Playwright Chromium needs system libs (libnss3, libnspr4, libatk1.0-0, libgbm1, libasound2, fonts-noto-color-emoji).
**Optional deployment config:** `VITE_GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (see `DOCS/05-AUTH-SEO-DEPLOY.md`). Canonical URL assumed `https://unqstudio-cm.pages.dev/` — change it everywhere if you deploy elsewhere.
**Ideas next:** virtualize the "All (models.dev)" list; per-provider CORS capability probe cache; Gist/Drive conflict resolution (currently last-write-wins merge).
