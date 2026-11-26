# 01 · System Architecture

UnQStudio v2.0 is a **static SPA + optional edge functions**. Everything that matters (projects, chat, keys, builds) runs in the user's browser.

## 5 layers + edge

```
┌──────────────────────────────────────────────────────────────────────────┐
│ L5  UI            src/ui/**  (React 19, Tailwind 4, Floating UI)          │
│     Home · Workspace(Studio | Code) · Chat · Preview · Settings · Auth    │
├──────────────────────────────────────────────────────────────────────────┤
│ L4  State         src/store/**  (Zustand; persist → localStorage)         │
│     app · settings · chatPrefs · chat · workspace · vault · auth …        │
├──────────────────────────────────────────────────────────────────────────┤
│ L3  AI engine     src/core/ai/**                                          │
│     registry(models.dev) · modelFetcher · stream adapters · parser ·      │
│     patch engine · orchestrator · AES-GCM vault                           │
├──────────────────────────────────────────────────────────────────────────┤
│ L2  Runtime       src/core/runtime/**   esbuild-wasm · VFS resolver ·     │
│                   esm.sh CDN cache · sandboxed iframe · inspector bridge  │
├──────────────────────────────────────────────────────────────────────────┤
│ L1  Storage/Sync  src/core/vfs/** (IndexedDB) · src/core/auth/** (Drive,  │
│                   Gist) · src/core/deploy/** (git hosts)                  │
└──────────────────────────────────────────────────────────────────────────┘
        │ optional                                  │ static assets
        ▼                                           ▼
┌───────────────────────────────┐      ┌───────────────────────────────────┐
│ EDGE  functions/api/*.ts      │      │ public/ models-registry.json,     │
│  models-dev  (live registry)  │      │ logo.svg, llms.txt, sitemap …     │
│  auth/github (OAuth proxy)    │      └───────────────────────────────────┘
└───────────────────────────────┘
```

Dependency rule: `ui → store → core`; `core` never imports `ui`. Edge functions are standalone (Web APIs only).

## Module boundaries & ports

```ts
// src/core/runtime/types.ts
interface IRuntimeEngine {
  readonly id: string; readonly name: string
  init(onProgress?: (p: EngineProgress) => void): Promise<void>
  build(input: BuildInput): Promise<BuildResult>
  dispose(): Promise<void>
}
// src/core/vfs/types.ts — persistence port (IdbAdapter in browsers, MemoryAdapter in tests)
interface IStorageAdapter { /* projects, files, checkpoints, stats — see file */ }
// src/core/ai/providers.ts — provider contract (data, not classes)
interface IAIProvider /* = ProviderDef */ {
  id: string; name: string; kind: 'openai' | 'anthropic'; baseUrl: string
  models: ModelDef[]; local?: boolean; noKey?: boolean; headers?: Record<string,string>
}
//   streamChat(req: StreamRequest): AsyncGenerator<StreamChunk>   (src/core/ai/stream.ts)
// src/core/auth/types.ts
interface IAuthProvider {
  readonly id: 'google' | 'github'
  isConfigured(): Promise<boolean>
  signIn(): Promise<AuthSession>
  signOut(): Promise<void>
  getSession(): AuthSession | null
}
```

## End-to-end data flows

**Prompt → preview**
```
Composer.onSubmit → store/chat.send → orchestrator.buildMessages(vfs, pinned, history)
  → stream.streamChat(provider adapter: OpenAI-compatible | Anthropic)  [fetch + SSE, direct from browser]
  → parser (artifact grammar: <think>, <file>, <patch>) → apply.ts → VFS (checkpoint first)
  → useLiveBuild (debounced) → IRuntimeEngine.build → srcdoc → sandboxed <iframe>
  → bridgeScript postMessage → error catcher / inspector
```

**Model discovery**
```
Settings key saved ─debounce→ modelFetcher.fetchLiveModels(provider,key)
   ├─ ok  → enrich with models.dev metadata → store/models cache → ModelPicker
   └─ CORS/401 → fallback: models.dev catalog (registry) + manual custom model id
registry load order: /api/models-dev (edge, s-maxage 1h) → models.dev/api.json → /models-registry.json
                     cached in IndexedDB `unqstudio-registry` (24h TTL)
```

**Optional sign-in & cloud sync**
```
Google: GIS token client (browser only) → Drive appDataFolder JSON backup/restore
GitHub: /api/auth/github?action=login → github.com authorize → callback (code+state)
        → edge exchanges code with GITHUB_CLIENT_SECRET → token handed to the SPA (hash fragment)
        → used for repo import/push/Pages deploy + private Gist sync
```

## Deployment topology
Cloudflare Pages: `npm run build` → `dist/`; `functions/` compiled by Pages automatically. See `DOCS/05-AUTH-SEO-DEPLOY.md`.

## v3.0 architecture additions
- **Shell**: `App.tsx` = `AppSidebar` + routed main (`Home` | `Workspace`). Phones use `BottomSheet` for every Modal/Drawer/Dropdown sheet; `useVisualViewport` publishes `--kb-inset`.
- **Project record** (`ProjectMeta`): `thumbnail`, `starred`, `knowledge`, `bookmarks` (IndexedDB schema version unchanged).
- **AI**: `chat.send` (stream + apply) ← wrapped by `core/ai/agentLoop.ts` (read/search/verify tools, 1–5 steps) ← driven from `runHeal`. `buildProjectContext` injects Project Knowledge and a symbol map with local import edges.
- **Preview bridge**: adds `thumb:capture`/`thumb` and `route:*`/`route` messages.
- Layering unchanged: `ui → store → core`; `lib/qrcode.ts`, `lib/haptics.ts` are framework-free.
