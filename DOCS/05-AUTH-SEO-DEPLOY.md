# 05 · Auth, SEO/AEO & Deploy

## A. Cloudflare Pages deployment
1. Push the repo to GitHub. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Build settings: **Framework preset** None · **Build command** `npm run build` · **Output directory** `dist` · **Node** ≥ 22 (`NODE_VERSION=22`).
3. `functions/` is detected automatically (Pages Functions). `public/_headers` and `public/_redirects` (`/* /index.html 200`) are copied into `dist/`.
4. Optional environment variables (Settings → Environment variables → Production **and** Preview):

| Variable | Scope | Purpose |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | build-time (public) | Enables Google sign-in + Drive AppData sync |
| `GITHUB_CLIENT_ID` | runtime (Function) | GitHub OAuth app id |
| `GITHUB_CLIENT_SECRET` | runtime (Function, **Encrypt**) | GitHub OAuth app secret — never exposed to the browser |

Nothing is required: without them the app runs in guest mode and shows an honest "not configured" badge with a setup guide.

## B. SEO & AEO architecture (V2-M3)
- `index.html`: optimized `<title>`/description, canonical `https://unqstudio.pages.dev/` (change it if you deploy elsewhere — also in `sitemap.xml`, `robots.txt`, `llms*.txt`, JSON-LD), OpenGraph + Twitter cards (`og-image.png` 1200×630), dual `theme-color`, `manifest.webmanifest`, `rel=alternate` to `llms.txt`.
- **JSON-LD** (4 blocks): `SoftwareApplication` (DeveloperApplication, free, featureList), `Organization` (UnQTools, logo), `WebSite`, `FAQPage` (6 Q&As mirroring `FAQ` in `src/ui/home/AboutFaq.tsx` — a unit test asserts they match).
- `public/robots.txt` (AI crawlers explicitly allowed; `/api/auth/` disallowed), `sitemap.xml`, **`llms.txt`** (short authoritative summary) and **`llms-full.txt`** (complete spec) — Markdown written so ChatGPT / Perplexity / Claude / Google AI Overviews can quote and cite UnQStudio accurately.
- Home screen keeps the workspace clean: semantic `<header role=banner>`, `<nav aria-label=Primary>`, `<main>`, `<section>`s and a collapsed **About & FAQ** `<footer><details>` (text is in the DOM for crawlers).
- Brand assets are derived from the official logo (`public/logo.svg` ← `https://unqtools.pages.dev/logo.svg`) by `scripts/gen-brand-assets.mjs` (favicon.svg, apple-touch-icon.png 180, icon-192/512.png, og-image.png). Re-run it after replacing `logo.svg`.
