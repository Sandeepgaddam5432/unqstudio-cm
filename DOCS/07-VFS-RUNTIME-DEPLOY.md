# 07 · VFS, Runtime & Deploy — code-level reference

> Verified against `src/core/vfs/`, `src/core/runtime/`, `src/core/deploy/` (v2.1). Exact export lists live in `02-CODEBASE-MAP.md`; this page documents the *behaviour and contracts*.

## 1 · Virtual file system (`src/core/vfs/`)
### 1.1 IndexedDB layout (`IdbAdapter`, database `unqstudio`, version 1)
| Object store | Key | Indexes | Value |
|---|---|---|---|
| `projects` | `id` | — | `ProjectMeta` (`name`, `locks[]`, `historyPtr`, `pinned`, `templateId?`, `forkOf?`, `sourceRepo?`, timestamps) |
| `files` | `[projectId, path]` | `byProject(projectId)` | `FileRecord` (`content`, `encoding: 'utf8' \| 'base64'`, `updatedAt`, …) |
| `checkpoints` | `id` | `byProject(projectId)` | `CheckpointMeta` (`seq`, `label`, `kind`, `fileCount`, `bytes`, `hash`, `createdAt`) |
| `checkpointData` | out-of-line (checkpoint id) | — | `CheckpointPayload` `{ compressed: boolean, data: Uint8Array \| string }` |
| `kv` | out-of-line | — | misc JSON: `chat:<projectId>` (messages), the key-vault blob, backups meta |
Other databases: `unqstudio-cdn` (`modules`, esm.sh cache) and `unqstudio-registry` (`kv`, 24 h model-catalog cache). `MemoryAdapter` implements the same `IStorageAdapter` port for tests.

### 1.2 Checkpoint payload / snapshot format
`Snapshot = Record<absolutePath, { c: content, e?: encoding }>`. `pack()` = `JSON.stringify(snapshot)` → `Blob.stream().pipeThrough(new CompressionStream('gzip'))` → `{ compressed: true, data: Uint8Array }`; when `CompressionStream` is missing it stores `{ compressed: false, data: <json string> }`. `unpack()` reverses either form. `hashSnapshot()` (content hash, memoised per VFS `_version`) is stored in the checkpoint meta and drives dirty detection and de-duplication.

### 1.3 File & folder locks
`meta.locks` is a list of absolute paths. `lockedBy(path)` returns the first lock `l` for which `isUnder(path, l)` — so locking a folder covers every descendant. **Enforcement is for the AI only**: `write/remove/rename` call `assertWritable(path, actor)` and throw `FileLockedError(path, lockedBy)` when `actor === 'ai'`; user edits to locked files are allowed. `applyOp` (core/ai/apply.ts) turns the error into a failed OpRecord, `buildProjectContext` tags locked files `[LOCKED]` and lists them under “LOCKED paths (do not modify)”, and the inline ⌘K edit refuses to apply to a locked file.

### 1.4 Timeline pointer, undo/redo
`cps[]` is ordered by `seq`; `meta.historyPtr` is the index of the checkpoint the workspace currently equals. `isDirty()` ⇔ the current content hash ≠ `cps[historyPtr].hash`.
- `checkpoint(label, kind)` — snapshots, packs, appends, moves `historyPtr` to the end. `kind === 'auto'` with an unchanged hash returns the current checkpoint (no duplicates).
- `undo()` — if dirty first `checkpoint('Manual edits','auto')`; then `jumpTo(historyPtr - 1)`. `redo()` only works when clean and `historyPtr < last`.
- `restore(id)` — if dirty first `checkpoint('Before restore','restore')`, then `jumpTo(index)`, so nothing is ever lost. `forkFromCheckpoint` (projects.ts) copies a checkpoint into a new project (`forkOf`).
- `jumpTo(i)` = unpack → `applySnapshot` (diff-applies adds/changes/deletes) → set `historyPtr` → persist meta.
AI turns call `checkpoint('…','auto')` before applying ops (`checkpointBefore`) and after (`checkpointAfter`); per-turn Undo = `restore(checkpointBefore)`; the Auto-Heal pill's Undo restores the **first** turn's `checkpointBefore`.

### 1.5 ZIP scaffold, backup, folder sync
- `zip.ts` — `exportZip(vfs)` (jszip: text as UTF-8, binary from base64) and `importZip(blob)` → `ImportedProject` (strips a single top-level folder). `scaffold.ts` provides `index.html`, `package.json`, `tsconfig.json`, the Tailwind theme block between `THEME_START`/`THEME_END` markers, and `DEFAULT_THEME`.
- `backup.ts` — `createBackup()` serialises projects + files + checkpoints (+ chats/settings **without secrets**) to one JSON document; restore re-imports it.
- `fsSync.ts` — File System Access API: `isFsAccessSupported()`, `pickDirectory()`, `ensurePermission(handle, 'readwrite')`; the VFS is mirrored to the chosen folder and edits on disk can be pulled back. Unsupported browsers (Firefox/Safari) simply do not show the option.

## 2 · Runtime (`src/core/runtime/`)
- **esbuild-wasm** (`EsbuildWasmEngine`): fetches the bundled `.wasm` (CDN fallback), `WebAssembly.compile(buf)`, then `esbuild.initialize({ wasmModule, worker: true })` once; builds run in the wasm worker. Progress events feed the preview status (`initializing → building → ready | error`).
- **Virtual FS plugin** (`plugins.ts`): resolves `./`, `../`, `@/` aliases and `/abs` paths against the VFS with `RESOLVE_EXTS` probing (`.tsx .ts .jsx .js .json .css`, `index.*`), loads CSS, inlines assets.
- **esm.sh resolver** (`resolver.ts`): bare imports → `https://esm.sh/<pkg>@<version><subpath>` where `<version>` comes from `package.json` or `DEFAULT_VERSIONS`; `react`/`react-dom` are externalised to a single copy. `cdnCache.ts` caches modules in memory + IndexedDB `unqstudio-cdn/modules`; **unversioned URLs expire after one day, pinned versions never**.
- **Tailwind v4**: the preview loads `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4` and injects the project CSS (`@import "tailwindcss"`, theme tokens) — no PostCSS in the browser.
- **Preview document** (`previewHtml.ts`): opaque-origin sandboxed iframe (`allow-scripts allow-forms allow-modals allow-popups`), bundle inlined with `escapeInlineScript`, then `BRIDGE_SCRIPT`.
- **Bridge contract**: see `04-UI-AND-DESIGN-SYSTEM.md` (“Preview bridge … exact `postMessage` contract”): `ready`, `console`, `error`, `resource-error`, `inspect:select`, `screenshot` (iframe → host) and `inspect:enable`, `inspect:apply`, `theme`, `theme-css`, `screenshot` (host → iframe), all with `__unq: true`.

## 3 · Deploy (`src/core/deploy/`) — browser → REST, no proxy
| Target | Calls (all from the browser with the user's token) |
|---|---|
| **GitHub** (`github.ts`) | `GET /user`, `GET /repos/{o}/{r}` (+ `git/trees/{ref}?recursive`, `git/blobs/{sha}` for import) · push = `POST git/blobs` per file → `POST git/trees` → `POST git/commits` → `PATCH git/refs/heads/{branch}` (or `POST git/refs` when new); `GET git/ref/heads/{branch}` for the base; `POST /repos/{o}/{r}/pages` + a Pages workflow file for hosting. Base `https://api.github.com`. |
| **GitLab** (`gitlab.ts`) | `GET /api/v4/user`, `GET /projects/{id}`, `GET /projects/{id}/repository/tree?recursive=true&per_page=100&page=n`, one `POST /projects/{id}/repository/commits` with `actions[]` (`create`/`update`/`delete`). |
| **Netlify** (`hosts.ts`) | `https://api.netlify.com/api/v1` — `GET /user`, create site, `POST deploys` with a SHA1 **digest** map, then `PUT deploys/{id}/files/{path}` for the files Netlify reports as required. |
| **Vercel** (`hosts.ts`) | `GET https://api.vercel.com/v2/user`; `POST /v13/deployments` with inline base64 `files[]`; poll `GET /v13/deployments/{id}` until `READY`. |
| **Cloudflare Pages** (`hosts.ts`) | `GET https://api.cloudflare.com/client/v4/user/tokens/verify`; direct upload under `accounts/{id}/pages/projects/{name}` (file manifest + multipart upload); Git-connect fallback when direct upload is unavailable. |
| **Supabase** (`supabase.ts`) | `GET {projectUrl}/rest/v1/` (OpenAPI document with the anon/service key) → `parseTables`/`tsType` → typed client + SQL snippets; rows via `/rest/v1/<table>`. |
`verify.ts` runs the cheapest authenticated call per service (the `/user`-style endpoints above). Errors become `DeployError` with the HTTP status and a hint. Tokens come from the vault (`store/connections.ts`, secret name `conn:<service>:<field>`), never from source.

## v3.0 project metadata
`ProjectMeta` now carries `thumbnail?` (image data URL ≤ 40k chars, `core/preview/thumbnail.ts`), `starred?`, `knowledge?` (Project Knowledge markdown) and `bookmarks?` (starred checkpoint ids). Thumbnails are written with `persistThumbnail` and never change `updatedAt`. Bridge messages added: host→iframe `thumb:capture`, iframe→host `thumb`.
