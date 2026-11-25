# Changelog

(Full timestamped history and ADRs: [DOCS/06-CHANGELOG-AND-ADRS.md](./DOCS/06-CHANGELOG-AND-ADRS.md).)

## 2.0.0
- **M1** Floating UI model picker (desktop popover / mobile bottom sheet), 3-zone chat grid, zero-overlap composer, chat customization, mobile bottom navigation.
- **M2** models.dev registry (snapshot + edge + live per-provider `/models`), compatibility tags, dynamic OpenAI-compatible routing for any registry provider.
- **M3** Official logo + derived brand assets, SEO/AEO (JSON-LD, llms.txt, robots, sitemap, manifest), About & FAQ footer.
- **M4** Optional Google (GIS + Drive AppData) and GitHub (Pages Function OAuth + Gist) sign-in and cloud sync.
- **M5** Living documentation system: `AGENTS.md`, `CLAUDE.md`, `DOCS/01–06`, generated code map, `verify:docs` guard.
- **M6** Playwright E2E for layout/overlap, scroll anchoring, registry, SEO and auth UI + fresh screenshots.

## 1.0.0
First production release.
- **Workspace**: adaptive Studio / Code modes, command palette, themes (Obsidian Dark, Paper Light), responsive down to 375 px.
- **VFS**: IndexedDB projects, file/folder locks, compressed checkpoints (restore / fork / diff), ZIP import/export, local-folder sync, JSON backup.
- **Runtime**: esbuild-wasm pluggable engine, esm.sh packages with persistent cache, Tailwind v4 browser runtime, sandboxed preview + bridge, error banner with Fix-with-AI, viewports, screenshots.
- **AI**: 20 BYOK providers, Build/Plan/Ask, streaming artifact + patch protocol, reasoning blocks, approval tray, enhancer, vision, voice, @mentions, token/cost meter, encrypted vault, MCP connector probe.
- **Editor**: CodeMirror 6, explorer, search/replace, split/unified diff, visual click-to-edit inspector, Theme Studio.
- **Templates**: 8 static templates verified by compile + strict type-check tests.
- **Publish**: GitHub (import/push/Pages), GitLab, Netlify, Vercel, Cloudflare Pages (+fallback), Supabase explorer.
- **Quality**: 100+ unit tests, strict TypeScript, ESLint, headless Chromium E2E.
