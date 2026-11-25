# UnQStudio

A static, 100 % client-side **AI software-engineering studio**. Bring your own LLM key, describe an app, and watch
it compile with `esbuild-wasm` in a sandboxed preview — no backend, no WebContainers, nothing leaves your device.

- **Studio Mode** – chat-first workspace: conversational AI, step cards, 1-click undo, live preview.
- **Code Mode** (`⌘E`) – full IDE on the same live state: file tree, CodeMirror 6, search, diffs, console.
- **Static**: `npm run build` → `dist/` → deploy to Cloudflare Pages (see `DOCS/DEPLOYMENT.md`).

> Status: v1.0 is built milestone by milestone — see [`PROGRESS.md`](./PROGRESS.md).

## Quickstart

```bash
npm install
npm run dev        # http://localhost:5173
npm run test       # vitest
npm run build      # static bundle in dist/
```

## Architecture at a glance

```
src/
  core/vfs/      Virtual FS (IStorageAdapter → IndexedDB), checkpoints, file locks, ZIP
  core/runtime/  IRuntimeEngine → EsbuildWasmEngine, preview iframe bridge
  core/ai/       IAIProvider registry (20 BYOK providers), stream + patch parsers, vault
  core/deploy/   GitHub / GitLab / Cloudflare / Netlify / Vercel / Supabase connectors
  ui/            design-system primitives, Home, adaptive workspace shell
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md).

## Security

API keys are stored locally (optionally AES-GCM encrypted with a passphrase via PBKDF2). They are only sent to the
provider you configure. No telemetry, no server.
