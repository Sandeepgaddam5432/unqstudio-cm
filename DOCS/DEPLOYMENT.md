# Deploying UnQStudio on Cloudflare Pages (100 % static)

UnQStudio is a Vite SPA: `npm run build` → `dist/`. No Functions, KV or server runtime are required.

## Git integration (recommended)
1. Push the repository to GitHub/GitLab.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → select the repo.
3. Framework preset: *None* (or Vite). **Build command** `npm run build`, **Build output directory** `dist`. Environment: `NODE_VERSION=22`.
4. **Save and Deploy**. Every push to `main` redeploys; branches get preview URLs.

## Direct upload
```bash
npm ci && npm run build
npx wrangler pages deploy dist --project-name unqstudio
```

## What ships in `public/`
- `_redirects`: `/* /index.html 200` (SPA fallback; the app also uses hash routes so deep links work anywhere).
- `_headers`: immutable caching for `/assets/*` and `*.wasm` (`Content-Type: application/wasm`), no-cache for `index.html`, safe headers.
  There is intentionally **no restrictive CSP**: the app must reach `esm.sh`, the Tailwind browser CDN and the LLM provider you configure, and it renders sandboxed preview iframes.
- The 14 MB `esbuild.wasm` (≈3.8 MB gzip/brotli) is a hashed asset (below Cloudflare's 25 MiB per-file limit) with a jsDelivr fallback if it cannot be fetched.

## Custom domain
Pages project → **Custom domains → Set up a domain** → enter `studio.example.com` → add the suggested CNAME (or let Cloudflare manage DNS). HTTPS is automatic.
HTTPS (or localhost) is required for Web Crypto (key vault) and the microphone.

## Other static hosts
Netlify/Vercel/GitHub Pages work as-is (`base: './'`). For GitHub Pages sub-paths no extra config is needed.
