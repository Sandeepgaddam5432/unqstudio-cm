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
- `index.html`: optimized `<title>`/description, canonical `https://unqstudio-cm.pages.dev/` (change it if you deploy elsewhere — also in `sitemap.xml`, `robots.txt`, `llms*.txt`, JSON-LD), OpenGraph + Twitter cards (`og-image.png` 1200×630), dual `theme-color`, `manifest.webmanifest`, `rel=alternate` to `llms.txt`.
- **JSON-LD** (4 blocks): `SoftwareApplication` (DeveloperApplication, free, featureList), `Organization` (UnQTools, logo), `WebSite`, `FAQPage` (6 Q&As mirroring `FAQ` in `src/ui/home/AboutFaq.tsx` — a unit test asserts they match).
- `public/robots.txt` (AI crawlers explicitly allowed; `/api/auth/` disallowed), `sitemap.xml`, **`llms.txt`** (short authoritative summary) and **`llms-full.txt`** (complete spec) — Markdown written so ChatGPT / Perplexity / Claude / Google AI Overviews can quote and cite UnQStudio accurately.
- Home screen keeps the workspace clean: semantic `<header role=banner>`, `<nav aria-label=Primary>`, `<main>`, `<section>`s and a collapsed **About & FAQ** `<footer><details>` (text is in the DOM for crawlers).
- Brand assets are derived from the official logo (`public/logo.svg` ← `https://unqtools.pages.dev/logo.svg`) by `scripts/gen-brand-assets.mjs` (favicon.svg, apple-touch-icon.png 180, icon-192/512.png, og-image.png). Re-run it after replacing `logo.svg`.

## C. Optional authentication & cloud sync (V2-M4)
**Rule #1: zero forced login.** Guest mode is the default and always fully functional. Auth only adds identity + cross-device sync.

### C.1 Google (100% client-side, Google Identity Services)
`src/core/auth/googleAuth.ts` loads `https://accounts.google.com/gsi/client` lazily and uses `google.accounts.oauth2.initTokenClient` with scopes `openid email profile https://www.googleapis.com/auth/drive.appdata`. No backend and no client secret. Client id = Settings/Auth-modal override (`useAuth.googleClientIdOverride`, for self-hosters) or build-time `VITE_GOOGLE_CLIENT_ID`.

**Google Cloud Console setup**
1. APIs & Services → Library → enable **Google Drive API**.
2. OAuth consent screen → External → add scopes `openid`, `email`, `profile`, `…/auth/drive.appdata` (non-sensitive AppData scope) → add yourself as a test user while in *Testing*.
3. Credentials → Create credentials → **OAuth client ID** → *Web application* → **Authorized JavaScript origins**: `https://<your-site>.pages.dev` (and `http://localhost:5173` for dev). No redirect URIs needed (token client uses a popup).
4. Cloudflare Pages → Environment variables → `VITE_GOOGLE_CLIENT_ID=<client id>` (build-time, so redeploy).

### C.2 GitHub (Cloudflare Pages Function, authorization-code flow)
`functions/api/auth/github.ts` (standard Fetch/Crypto only):
| request | behaviour |
|---|---|
| `GET /api/auth/github?action=status` | `{ "configured": boolean }` (both env vars present) |
| `GET /api/auth/github?action=login` | 24-byte random `state` → HttpOnly/Secure/SameSite=Lax cookie `unq_gh_state` (600 s, `Path=/api/auth`) → `302` to `https://github.com/login/oauth/authorize` (`scope=read:user user:email repo gist`, `redirect_uri=<origin>/api/auth/github`) |
| `GET /api/auth/github?code&state` | verifies state == cookie (else 400), exchanges the code with `GITHUB_CLIENT_SECRET`, fetches `/user`, returns an HTML page (`no-store`, state cookie cleared) that `postMessage`s `{type:'unq-github-auth', ok, token, user}` to the opener (same origin only) or, without an opener, stashes it in `sessionStorage['unq.session.pending']` and redirects to `/` |
| unconfigured | `501` JSON with instructions — the SPA checks `status` first and shows the setup guide instead |
All embedded JSON is escaped (`<`, `>`, `&`, U+2028/9) so provider error text cannot break out of the inline script.

**GitHub OAuth App setup**
1. GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**.
2. Homepage URL `https://<your-site>.pages.dev`; **Authorization callback URL** `https://<your-site>.pages.dev/api/auth/github`.
3. Generate a client secret. In Cloudflare Pages → Settings → Environment variables add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (type **Secret**) for Production and Preview. Redeploy.
(For local dev with Functions use `npx wrangler pages dev dist` and a second OAuth App with callback `http://localhost:8788/api/auth/github`.)

### C.3 Session handling (`src/store/auth.ts`)
Tokens live in **sessionStorage only** (`unq.session.google|github`; Google tokens carry `expiresAt`). Only `lastSynced` and the client-id override persist (`unq.auth.v1`). Tokens are excluded from backups (`snapshot.ts` filters `unq.auth|models|session`). `src/store/connections.ts#getConn('github')` falls back to the OAuth token, so **GitHub repo import, push and GitHub Pages deploy work without a manually created PAT**.

### C.4 Sync protocols
Payload = `BackupFile` v1 (`src/core/vfs/backup.ts`) built by `buildSyncSnapshot`: projects + files + chats + sanitized `unq.*` settings. **Never** the key vault, never checkpoints, MCP headers stripped.
- **Google Drive AppData** (`googleDriveSync.ts`): `GET files?spaces=appDataFolder&q=name='unqstudio-backup.json'` → create (`POST …/upload/drive/v3/files?uploadType=multipart`, `parents:['appDataFolder']`) or update (`PATCH …/files/{id}`) with a hand-built `multipart/related` body; restore = `GET files/{id}?alt=media`. Files are invisible in the user's Drive UI and private to this OAuth client.
- **GitHub Gist** (`githubGistSync.ts`): one **secret** gist (`public:false`) containing `unqstudio-backup.json`; found by file name across the first 300 gists; truncated files are re-fetched via `raw_url`.
- Restore is a **merge** (`restoreBackup(..., 'merge')`) followed by a reload.
- UI: `AccountPill` (TopBar + Home) → `AuthModal` (Continue with Google / GitHub, honest *ready / not configured* badges, 3-step `SetupGuide`) and an avatar menu with **Sync now**, **Restore**, last-synced time and **Sign out**.


## v2.1 — `VITE_SITE_URL` (dynamic canonical origin)
`scripts/gen-seo-assets.mjs` runs in `prebuild` (and `npm run gen:seo`). It reads `VITE_SITE_URL` (process env → `.env.production` → `.env`), trims trailing slashes, validates http(s) and **defaults to `https://unqstudio-cm.pages.dev`**. The CURRENT origin is detected from `<link rel="canonical">` and replaced everywhere it occurs: `index.html` (canonical, `og:url`, `og:image`, `twitter:image`, all JSON-LD URLs), `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt`, `public/llms-full.txt`, `public/manifest.webmanifest`. It is idempotent and can switch domains repeatedly. To move to a custom domain: Cloudflare Pages → Settings → Environment Variables → `VITE_SITE_URL=https://customdomain.com` → redeploy; no code change.
Session storage: OAuth tokens exist **only** in `sessionStorage` keys `unq.session.<provider>` (never IndexedDB/localStorage, never in backups); provider API keys are in the IndexedDB vault (`unqstudio` → `kv`), optionally AES-GCM-256 encrypted.

## v3.0 PWA, Publish sheet, QR, SEO editor
- PWA: manifest `id`, `display_override`, shortcuts; `apple-mobile-web-app-*` meta; `viewport-fit=cover`; theme-color synced with the theme (`syncThemeColorMeta`).
- Publish sheet tabs: Publish (live URL + QR + Netlify/Vercel/Cloudflare, GitHub Pages, ZIP), Share & SEO, Download, Git, Supabase.
- SEO editor writes title, description, Open Graph/Twitter tags and favicon into the generated project's `/index.html` (not into UnQStudio's own head).

## CORS proxy for custom providers (v3.3) — `functions/api/proxy.ts`

`POST /api/proxy` (Cloudflare Pages Function, Web APIs only). Body: `{ "url": "https://…", "method": "GET"|"POST", "headers": {…}, "body": "<string|json>" }`.
- **SSRF guard** (`assertPublicHttpsUrl`): `https` only; no credentials in the URL; ports 443/2053/2083/2087/2096/8443; rejects IPv6 literals, loopback, RFC1918, CGNAT, link-local (169.254.169.254), TEST-NETs, multicast/reserved IPv4, single-label and `.local/.internal/.localhost/.svc/…` hosts, and the proxy's own host. Redirects are **not** followed (502 `upstream_redirect`).
- **CORS**: only the deployment's own origin and `localhost`/`127.0.0.1` dev origins; `Vary: Origin`; exposes `x-unq-proxy`, `x-unq-upstream-status`, `retry-after`.
- **Headers**: forwards `Authorization`, `x-api-key`, `anthropic-version` and custom headers; strips `Host`, `Cookie`, `Origin`, `Referer`, `cf-*`, `x-forwarded-*`, hop-by-hop headers.
- **Streaming**: the upstream body is returned as-is (`text/event-stream` is never buffered; `Cache-Control: no-store, no-transform`, `X-Accel-Buffering: no`). Upstream status codes and error bodies pass through verbatim.
- Keys are only forwarded, never stored or logged. On hosts without the function (static preview, dev server) the client detects the missing `x-unq-proxy` header and falls back to a direct request.
