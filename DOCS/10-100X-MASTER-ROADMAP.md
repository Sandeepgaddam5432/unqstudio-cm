# 10 · 100x Master Roadmap — 41 capabilities, upgraded to frontier spec (v3.6.1)

> **Status basis.** Every status below was audited against the code at commit `05ea311` (v3.6.0) — import graph (`grep` for production importers, tests excluded), unit-test/e2e coverage, and a real baseline run of the gates (`verify:docs` ✓ · `tsc` ✓ · `eslint` ✓ · vitest **53 files / 655 tests** ✓ · `vite build` ✓ with main chunk `index-*.js` **616.16 kB** and **no `typecheckWorker` chunk emitted**). Per `AGENTS.md` (Anti-Hallucination Rule) a capability is `VERIFIED` only with a passing automated test **and** observed runtime behaviour; otherwise `PARTIAL`, `MISSING`, `ENV-LIMITED` (needs external credentials/bindings) or `TRACK-B` (needs a server-side runtime that Track A deliberately does not ship). This file is the owner's 41-capability "100x Product Review" plan, *upgraded* to concrete engineering specs. Statuses are updated by every milestone; the tally in §6 is generated from the matrix and must be re-checked whenever a status changes.
>
> Related: `DOCS/08` (honest audit + per-phase tables), `DOCS/01` (layers/ports), `DOCS/03` (AI engine), `DOCS/09` (UI/UX spec).

## 1 · North Star & dual-track architecture
**North Star:** an AI engineer that can *change, check, see, and ship* a full-stack app from a browser tab — with a verifiable receipt for every claim it makes — at **$0 server cost**, with the user's own keys and the user's own data.

| | **Track A — Static-first + Cloudflare edge** (default, shipped) | **Track B — Pluggable Pro / hybrid runtime** (future, optional) |
|---|---|---|
| Hosting | 100 % static SPA in `dist/` on Cloudflare Pages; optional `functions/` (Web APIs only, zero Node deps) that degrade gracefully when unbound | Same SPA + a remote/embedded runtime attached through the ports |
| State | IndexedDB VFS, gzip checkpoints, local vault; optional Supabase (user's project) | Server workspace snapshots, queues, billing ledger |
| Compute | `esbuild-wasm` + (planned) TypeScript Web Worker, opaque-origin sandboxed iframe | WebContainers / isolated containers with CPU/RAM/time/egress caps, cron/queues, Yjs relay |
| Covers | ≈ 85 % of the 41 capabilities (37 of 41 are Track A in the matrix) | #21 containers, #22 server runtime, #30 pinned comments, #31 co-editing (+ the hosted halves of #34/#35) |
| Contract | `IRuntimeEngine`, `IStorageAdapter`, `IAuthProvider` (`src/core/runtime/types.ts`, `src/core/vfs/types.ts`, `src/core/auth/types.ts`) | Implements the **same** ports; absence must never break Track A (feature-detect, hide the UI, never throw) |

**Invariant:** Track B code may only be *added behind a port*. A static build with no adapters must remain fully functional, and every Track-B-only capability is listed `TRACK-B` (never `VERIFIED`) until an adapter and a test exist.

## 2 · P0 reliability unblocker (#0) — zero-failure streaming & resumable write engine
**Problem.** `"Stopped before the file was finished – nothing was written / request timed out"` — a model stream stalls or is cut at the provider's output cap mid-file, and the whole file is discarded.

**Spec** (core: `src/core/ai/resilientStream.ts`, consumed by `src/core/ai/orchestrator.ts` and `src/store/chat.ts`):
1. **Stall watchdog** — per-chunk idle timer (adaptive: first-token budget ≫ inter-token budget); on expiry abort the fetch via `AbortController` and treat the partial text as a *truncation*, not an error.
2. **Tail-context auto-continuation** — re-issue the request with the already-produced prefix as an assistant turn plus a "continue exactly where you stopped" instruction, carrying the last N characters of the open file as the overlap anchor. Bounded continuations (default 3) with exponential back-off.
3. **Overlap-dedup stitching** — find the longest suffix(prefix)/prefix(continuation) overlap (exact, then whitespace-normalised) and drop it; refuse to stitch when no overlap is found and surface a `RecoveryCard` instead of silently corrupting the file.
4. **Patch-first discipline** — prompts steer the model to `<patch>` hunks for existing files and to files < ~300 lines for new ones, shrinking the blast radius of a cut stream.
5. **Partial salvage** — a file tag that never closed is written only after a syntax sanity check (balanced braces / esbuild transform) *or* shown as a `RecoveryCard` with *Continue · Keep partial · Discard*; nothing is lost without the user's decision.
6. **Acceptance:** with a fake stream that stalls at 40/70/95 % of a file, the final file equals the full reference byte-for-byte for ≥ 95 % of seeded cases; no case writes a half-file silently; the UI shows `Writing /path · N lines` progress throughout.

**Status:** core logic **VERIFIED (unit tests)** since v3.4.0; wired into `store/chat.ts`. UI (`RecoveryCard` in `src/ui/chat/MessageView.tsx`) is type-checked and built but has **no unit test and no scripted Chromium scenario** → overall **PARTIAL**. Never tested against a real LLM: stitching only dedupes exact/prefix overlaps; models may still paraphrase on resume.

## 3 · Top 5 game changers — strict execution order
1. **Agentic tool & verify loop** — `Edit → Typecheck → Build → Test/Inspect → Fix`, provider-native parallel tool calls, bounded budgets, one-click whole-turn undo. (#1, #4, #9)
2. **Browser auto-verify** — deterministic DOM/layout health audit + console/network telemetry + vision screenshot self-critique → honest `✓ Verified` receipt. (#2, #20, #38)
3. **Deep project brain** — AST symbols + `export *` + reverse `usedBy` + BM25 + grep + living `/.unq/rules.md`. (#3, #7)
4. **Precision safety net** — pre-run checkpoints, per-hunk diff, live secret-leak scanner, inline permission cards, `ask_user`. (#6, #10, #12, #39, #40)
5. **Instant distribution & full-stack** — one-click deploy + history/rollback + password-gated share links + visual Supabase ERD/Auth/Storage. (#24–#28, #32, #33)

Rationale for the order: 1 produces trustworthy edits, 2 proves them, 3 lets the agent find the right code on large repos, 4 makes autonomy safe enough to leave running, 5 turns the verified result into a URL.

## 4 · Complete 41-capability upgraded master matrix
Legend — **Priority** P0/P1/P2 · **Effort** S/M/L/XL · **Track** A/B · **Status** `VERIFIED | PARTIAL | MISSING | ENV-LIMITED | TRACK-B`. *Basic goal* = the owner's original line; *Upgrade* = the frontier-grade design. "Code paths" lists existing files (✓) and planned files (→). Every status is as of v3.6.0 unless the *Changelog* in `DOCS/06` says otherwise.

### 4.1 Summary table
| ID | Category | Pri | Effort | Track | Capability | Status | Primary code paths |
|---|---|---|---|---|---|---|---|
| 1 | Agent & AI | P0 | XL | A | Agentic tool loop | PARTIAL | ✓ `core/ai/agentLoop.ts` `core/ai/tools.ts` · → `core/ai/toolExecutors.ts` |
| 2 | Agent & AI | P0 | L | A | Browser auto-verify | PARTIAL | ✓ `core/runtime/previewAudit.ts` `core/runtime/bridgeScript.ts` `core/ai/verifyLoop.ts` · → `ui/chat/VerifyReceiptBadge.tsx` |
| 3 | Agent & AI | P0 | L | A | Repo-wide context index | PARTIAL | ✓ `core/ai/repoMap.ts` `core/ai/projectBrain.ts` |
| 4 | Agent & AI | P0 | M | A | Self-healing build loop | PARTIAL | ✓ `core/ai/selfHeal.ts` `core/runtime/typecheck.ts` `core/runtime/tsCheck.ts` `core/runtime/typecheckWorker.ts` |
| 5 | Agent & AI | P1 | M | A | Plan mode + approval | PARTIAL | ✓ `store/settings.ts` (`AIMode`) `ui/chat/MessageView.tsx` |
| 6 | Agent & AI | P1 | S | A | Mid-run clarifying questions | MISSING | → `ui/chat/ClarificationCard.tsx` |
| 7 | Agent & AI | P1 | M | A | Persistent project memory | PARTIAL | ✓ `store/prefs.ts` `ui/project/ProjectSettings.tsx` · → `core/ai/projectRules.ts` |
| 8 | Agent & AI | P2 | L | A | Background runs + resume | MISSING | → `core/ai/runState.ts` |
| 9 | Agent & AI | P2 | M | A | BYO key + smart model routing | PARTIAL | ✓ `store/aiConfig.ts` `core/ai/vault.ts` `core/ai/providers.ts` |
| 10 | Editor & DX | P0 | M | A | Checkpoints + version history | VERIFIED | ✓ `core/vfs/vfs.ts` `core/vfs/compress.ts` `ui/workspace/HistoryPanel.tsx` `ui/chat/VersionCard.tsx` |
| 11 | Editor & DX | P0 | S | A | Env vars & secrets editor | MISSING | → `ui/project/EnvEditor.tsx` |
| 12 | Editor & DX | P1 | L | A | Multi-file tabs + per-hunk diff | PARTIAL | ✓ `ui/code/EditorPane.tsx` `ui/code/DiffViewer.tsx` `core/vfs/hunkDiff.ts` |
| 13 | Editor & DX | P1 | S | A | Command palette | VERIFIED | ✓ `ui/CommandPalette.tsx` `ui/commandsExtra.tsx` |
| 14 | Editor & DX | P1 | M | A | Project-wide search & replace | VERIFIED | ✓ `ui/code/SearchPanel.tsx` `core/vfs/vfs.ts` (`replaceAll`) |
| 15 | Editor & DX | P1 | M | A | npm package search + install UI | PARTIAL | ✓ `core/runtime/npmSearch.ts` · → `ui/code/PackageManager.tsx` |
| 16 | Editor & DX | P2 | M | A | Inline diagnostics + quick fix | MISSING | ✓ `core/runtime/typecheck.ts` (not called) · → CodeMirror lint in `ui/code/CodeEditor.tsx` |
| 17 | Editor & DX | P2 | S | A | Asset upload / drag & drop | PARTIAL | ✓ `ui/code/FileTree.tsx` (binary base64 write) |
| 18 | Runtime & Preview | P0 | M | A | Reliable compile runtime + logs + recovery | PARTIAL | ✓ `core/runtime/esbuildEngine.ts` `core/runtime/compile.ts` `ui/preview/useLiveBuild.ts` |
| 19 | Runtime & Preview | P0 | L | A | Workspace persistence | PARTIAL | ✓ `core/vfs/idbAdapter.ts` `core/runtime/cdnCache.ts` `core/auth/githubGistSync.ts` `core/auth/googleDriveSync.ts` |
| 20 | Runtime & Preview | P1 | M | A | Preview console & network panel | VERIFIED | ✓ `ui/preview/Preview.tsx` `store/preview.ts` `core/runtime/previewAudit.ts` |
| 21 | Runtime & Preview | P1 | XL | B | Sandboxed containers + limits | TRACK-B | ✓ Track-A iframe sandbox `ui/preview/Preview.tsx` · port `core/runtime/types.ts` |
| 22 | Runtime & Preview | P1 | XL | B | Server-side runtime | TRACK-B | → `functions/` scaffolds · Track-B adapter |
| 23 | Runtime & Preview | P2 | M | A | Multi-target previews | PARTIAL | ✓ `ui/preview/PreviewToolbar.tsx` `ui/preview/Preview.tsx` |
| 24 | Full-stack | P0 | L | A | One-click Supabase + visual schema designer | PARTIAL | ✓ `services/supabase/erd.ts` `ui/publish/SupabaseFullstack.tsx` · → `ui/publish/SchemaDesigner.tsx` |
| 25 | Full-stack | P1 | M | A | Migration runner + seed data | PARTIAL | ✓ `services/supabase/migrations.ts` `services/supabase/erd.ts` |
| 26 | Full-stack | P1 | M | A | Auth scaffolding | PARTIAL | ✓ `services/supabase/scaffold.ts` (`useSession`) |
| 27 | Full-stack | P2 | M | A | Storage + image transforms | MISSING | → `services/supabase/scaffolds.ts` |
| 28 | Collaboration | P0 | S | A | Public/unlisted share link | MISSING | → `functions/api/share.ts` `core/deploy/share.ts` |
| 29 | Collaboration | P1 | M | A | Templates gallery + remix | VERIFIED | ✓ `src/templates/*` `ui/home/TemplateCard.tsx` `ui/home/templatePreview.ts` `core/plugins.ts` |
| 30 | Collaboration | P2 | L | B | Comments on live preview elements | TRACK-B | — |
| 31 | Collaboration | P2 | XL | B | Real-time co-editing + cursors | TRACK-B | — |
| 32 | Deploy & Ops | P0 | L | A | One-click deploy + domain + SSL + rollback | PARTIAL | ✓ `core/deploy/hosts.ts` `core/deploy/github.ts` `ui/publish/DeployTab.tsx` · → `store/deployments.ts` |
| 33 | Deploy & Ops | P1 | M | A | Environment per stage | MISSING | — |
| 34 | Deploy & Ops | P1 | L | A | Logs, error tracking, uptime | PARTIAL | ✓ `core/diagnostics.ts` `ui/settings/DebugTab.tsx` |
| 35 | Deploy & Ops | P2 | L | A | Analytics + billing primitives | MISSING | — |
| 36 | Design & Theme | P1 | M | A | Theme studio | PARTIAL | ✓ `ui/theme/ThemeStudio.tsx` `core/runtime/theme.ts` |
| 37 | Design & Theme | P1 | M | A | Component library browser | MISSING | → `core/components/blocks.ts` |
| 38 | Design & Theme | P1 | M | A | Responsive + a11y checker | PARTIAL | ✓ `core/runtime/a11yChecks.ts` · → `ui/preview/A11yAudit.tsx` |
| 39 | Trust & Safety | P0 | L | A | Permission prompts | PARTIAL | ✓ `store/prefs.ts` (`gate()`) · → `store/permissions.ts` |
| 40 | Trust & Safety | P0 | M | A | Secrets vault + leak detection | PARTIAL | ✓ `core/ai/vault.ts` `core/security/leakScanner.ts` |
| 41 | Trust & Safety | P2 | M | A | Audit log + quotas | MISSING | → `store/insights.ts` |

### 4.2 Upgraded specifications (design · failure modes/security · acceptance · honest gap)

#### Agent & AI
**#1 Agentic tool loop** — *Basic:* files + typecheck/build + preview inspect in one loop.
- *Design:* a `ToolSpec` registry (`tools.ts`: `list_files, read_file{startLine,endLine}, grep_search, find_symbols, patch_file, create_file, update_file, delete_file, verify_project, inspect_preview, ask_user, update_rules`) serialised per wire (`toolsForWire(kind)` → OpenAI `tools[]`, Anthropic `tools[]`, Gemini `functionDeclarations`, Ollama `tools[]`). A `NativeToolCallAccumulator` reassembles streamed argument deltas; `partitionCalls` runs read-only calls in parallel and mutating calls sequentially. On `isToolUnsupportedError` (HTTP 400/422 mentioning tools) the turn silently falls back to XML tags (`parseXmlToolCalls`). Budgets: max steps (1–5), max tokens, wall-clock; abort propagates to every in-flight tool; the whole turn is one checkpoint pair so *Undo turn* is a single restore.
- *Failure/security:* schema-validate every argument (`validateToolArgs`); path-normalise to the VFS root; locked files are never written; mutating tools pass the permission gate (#39).
- *Acceptance:* a scripted 4-protocol fake server returns parallel `read_file`+`grep_search`, then `patch_file`; the turn finishes in ≤ budget steps, XML fallback produces identical file results.
- *Gap (v3.6.0):* XML-tag loop (`agentLoop.ts`) is VERIFIED; `tools.ts` schemas/parsers are unit-tested but **not on the wire** and there is no `toolExecutors.ts`; no parallel calls.

**#2 Browser auto-verify** — *Basic:* screenshot + console + network + layout.
- *Design (two tiers):* **Tier 1 (all models, zero cost)** — `BRIDGE_SCRIPT` `audit:run` → `audit:result` collects blank-root detection, horizontal overflow, broken `<img>`, failed `fetch`/XHR (status, timing), uncaught errors for a 10 s window after render. **Tier 2 (models with `vision: true`)** — `screenshot` PNG downscaled to ≤ 1024 px, sent with a fixed critique rubric; result folded into the receipt. `verifyLoop.ts` aggregates into `VerifyReceipt { buildMs, tsErrors, consoleErrors, networkErrors, dom, visual }` rendered as an expandable `✓ Verified / Needs attention / Unverified` badge that never says "verified" for a row that was skipped.
- *Failure/security:* screenshots stay local unless a vision model is explicitly chosen; the audit is read-only DOM inspection inside the opaque-origin iframe.
- *Acceptance:* a seeded blank-screen app yields `Needs attention` with a DOM reason; a healthy app yields `Verified` with every row populated.
- *Gap:* bridge audit + Network tab + `verifyLoop.ts` logic are tested; **not auto-run, no vision capture, no badge, no `ChatMessage.receipt`**.

**#3 Repo-wide context index** — *Basic:* grep + AST + BM25/embeddings.
- *Design:* incremental, content-hash-cached **Project Brain**: per file → exports/props/store slices/imports (today regex-grade `repoMap.ts`; target TypeScript AST in the worker), `export *` resolution, reverse `usedBy` graph, regex grep, and a client-side **BM25** over path + symbols + content with a token-budgeted selector replacing the regex pick in `buildProjectContext`. Cache key `sha1(content)` in IndexedDB; rebuild only changed files. No embeddings (would need a model/network); BM25 is zero-cost and deterministic.
- *Acceptance:* on a 200-file fixture, the query "checkout total" ranks the right files top-3 within a 28 k-char budget; re-index after a 1-file edit < 50 ms.
- *Gap:* `projectBrain.ts` (BM25, `resolveExports`, `usedBy`) VERIFIED in unit tests, **not imported by any production code**; no worker; `repoMap.ts` still drives context.

**#4 Self-healing build loop** — *Basic:* `tsc`/esbuild/runtime → auto-fix.
- *Design:* unify esbuild errors + Worker TypeScript diagnostics (`typecheckProject`) + 10 s runtime errors into one `Issue[]`; each round hashes `(file, code, message)` into a **no-progress signature** — identical signature twice stops the loop; max 3 rounds; heal turns collapse into one expandable group; one click undoes the series.
- *Acceptance:* a seeded type error is fixed in ≤ 2 rounds; an unfixable error stops after the signature repeats with a clear message.
- *Gap:* `selfHeal.ts` VERIFIED for build + console errors (≤ 3 rounds, ~1.8 s runtime window). `typecheck.ts`/`typecheckWorker.ts` exist and are tested with a real `ts.Program`, but **nothing imports them from the UI/agent and the production build emits no worker chunk** (checked: `ls dist/assets`).

**#5 Plan mode + approval** — *Basic:* plan first, then execute.
- *Design:* `plan` mode returns a structured blueprint (steps, file-impact badges create/modify/delete, risk flags, estimated tokens) rendered as an editable checklist; **Approve & Execute** switches to `build` with the approved steps injected as constraints.
- *Gap:* `AIMode = 'build'|'plan'|'ask'` exists and per-op *Apply / Apply all* approval exists in `MessageView.tsx`; the structured blueprint card and editable checklist are **MISSING**.

**#6 Mid-run clarifying questions** — *Basic:* ask the user mid-task.
- *Design:* `ask_user{questions:[{id,prompt,options[],allowCustom}]}` pauses the loop (the stream is closed, state kept in memory/#8), renders an inline glass card with option pills + free text; the answer is appended as a `tool_result` and the loop resumes. Timeout → agent proceeds with its stated default.
- *Gap:* tool spec only; no card, no pause/resume. **MISSING**.

**#7 Persistent project memory** — *Basic:* `/.unq/rules.md`.
- *Design:* real VFS file, bidirectionally synced with Project Settings → Project Knowledge, auto-injected every turn (token-capped, header-first), agent-writable through `update_rules` with a diff recorded in the Timeline; versioned by checkpoints.
- *Gap:* user `instructions`/`memory` live in `usePrefs` and Project Knowledge UI exists (`ProjectSettings.tsx`); no VFS file, no `update_rules`. **PARTIAL**.

**#8 Background runs + resume** — *Basic:* survive reloads.
- *Design:* an IndexedDB run state-machine `{runId, plan, stepIdx, partialOps, messages, budgets}` flushed per step; on boot a banner offers *Resume / Discard*. Resumption re-uses #0 continuation for a half-streamed file.
- *Gap:* nothing persisted beyond messages. **MISSING**.

**#9 BYO key + smart model routing** — *Basic:* choose models per task.
- *Design:* `fast` vs `flagship` model slots per workspace; a router sends read/grep/classify/enhance/inline edits to `fast`, Build/Plan/hard fixes to `flagship`; falls back to the active model when unset.
- *Gap:* BYOK for 300+ providers over 4 wire protocols + AES-GCM vault is VERIFIED; **no per-task routing / fast-model setting**. **PARTIAL**.

#### Editor & DX
**#10 Checkpoints + version history** — gzip-compressed linear timeline, automatic pre-turn snapshots, manual bookmarks, fork-from-checkpoint, diff, restore (`HistoryPanel.tsx`, `VersionCard.tsx`, `vfs.ts`, `compress.ts`). Unit-tested (6 test files reference it) + 4 e2e checks. **VERIFIED** for the basic goal; *deploy-linked rollback* belongs to #32 and is MISSING.

**#11 Env vars & secrets editor** — *Design:* masked key/value table, `dev|staging|prod` profiles stored as `/.env`, `/.env.staging`, `/.env.production`; `VITE_*` keys flagged "shipped to the browser", live preview injection, real-time leak classification via #40; never included in ZIP/Git/share unless the user ticks it. *Gap:* no editor exists. **MISSING**.

**#12 Multi-file tabs + per-hunk diff** — *Design:* `computeHunks` → per-hunk Accept/Reject → `applyHunks` writes one checkpoint; shown in `DiffViewer` and in the Changes cards of `ActivityInspector`. *Gap:* tabs/DiffViewer exist; `hunkDiff.ts` VERIFIED in unit tests but **no UI imports it**. **PARTIAL**.

**#13 Command palette** — `Cmd/Ctrl+K` fuzzy launcher (`CommandPalette.tsx`, `commandsExtra.tsx`; 1 unit-test file, 5 e2e references). **VERIFIED** for its current sources: navigation, settings, theme switching, undo/redo/checkpoint/publish, open-file, new-project-from-template. Symbols, models, AI modes and deploy targets are *not* palette sources yet (upgrade items).

**#14 Project-wide search & replace** — regex/case/word, lock-safe `vfs.replaceAll` returning skipped-locked paths (`SearchPanel.tsx`; 2 unit-test files). **VERIFIED (unit)**; live replace-preview diff and an auto-checkpoint are not asserted by any test — treat as upgrade items.

**#15 npm package search + install UI** — *Design:* debounced `registry.npmjs.org/-/v1/search`, version picker, `addDependency/removeDependency` on `/package.json`, `esm.sh` pre-warm into the CDN cache, triggers rebuild. *Gap:* `npmSearch.ts` helpers VERIFIED; **no PackageManager UI**. **PARTIAL**.

**#16 Inline diagnostics + quick fix** — *Design:* Worker TS diagnostics → CodeMirror 6 `@codemirror/lint` squiggles + gutter + hover + "Fix with AI" (prompt carries code frame + message), 400 ms debounce. *Gap:* no CodeMirror lint dependency, no wiring. **MISSING**.

**#17 Asset upload / drag & drop** — `FileTree.tsx` already writes dropped binary files with `encoding: 'base64'` (`isBinaryPath`). *Gap:* no thumbnail, no copy-path button, no tests. **PARTIAL**.

#### Runtime & Preview
**#18 Reliable compile runtime** — `esbuildEngine.ts` (esbuild-wasm worker) + `useLiveBuild.ts`; e2e compiles real templates. *Gap:* auto-reinit-after-crash, structured log schema and the < 300 ms hot-rebuild budget are **unmeasured**. **PARTIAL**.

**#19 Workspace persistence** — IndexedDB VFS (`idbAdapter.ts`) + persistent esm.sh module cache (`cdnCache.ts`) are VERIFIED. Optional cloud sync (`githubGistSync.ts`, `googleDriveSync.ts`) needs OAuth credentials → **ENV-LIMITED for that sub-feature**; Track B server snapshots absent. Overall **PARTIAL**.

**#20 Preview console & network panel** — bridge `console`/`error`/`resource-error`/`network` → `store/preview.ts` → drawer in `Preview.tsx` (6 unit-test files, 9 e2e references). **VERIFIED** for the user-facing panel; feeding the same stream to the agent is part of #2.

**#21 Sandboxed containers + limits** — Track A: opaque-origin iframe (`sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"`, no `allow-same-origin`). Track B: `IRuntimeEngine` adapter for WebContainers / E2B / Cloudflare Containers with CPU/RAM/time/egress caps and a kill switch. No adapter exists → **TRACK-B**.

**#22 Server-side runtime** — Track A: Pages Functions + Supabase Edge Functions + `pg_cron` SQL scaffolds the user deploys themselves; Track B: managed workers/queues. Nothing generated today → **TRACK-B**.

**#23 Multi-target previews** — desktop/tablet/mobile/custom W×H, route bar, new tab, fullscreen exist (`PreviewToolbar.tsx`; **no unit/e2e coverage found**). Rotate, zoom, standalone share URL missing. **PARTIAL**.

#### Full-stack
**#24 One-click Supabase + visual schema designer** — *Design:* interactive ERD (tables, SQL types, PK/FK, NOT NULL, unique, owner-RLS and Realtime toggles) → FK-ordered SQL (`erd.ts`). *Gap:* generator VERIFIED; `SupabaseFullstack.tsx` offers the earlier single-table flow; **no visual designer**. **PARTIAL**.

**#25 Migration runner + seed data** — `runSql` (Supabase Management API, SQL-Editor fallback, `migrations.ts`, 1 test file) and deterministic seed SQL + FK-ordered migration generation (`erd.ts`) exist. **`isDestructiveSql` does not exist yet** (grep-verified at `05ea311`) — the destructive-SQL guard, versioned `/supabase/migrations/*.sql` writer and permission-card gating are MISSING. **PARTIAL**.

**#26 Auth scaffolding** — generated `useSession` (`services/supabase/scaffold.ts`) exists; no Auth UI/route guard/role helpers scaffold. **PARTIAL**.

**#27 Storage + image transforms** — bucket policy SQL + typed upload/signed-URL/transform helpers. Nothing exists. **MISSING**.

#### Collaboration
**#28 Public/unlisted share link** — `functions/api/share.ts` (KV/R2, size cap, SHA-256 password gate, expiry, sandboxed viewer; unbound → HTTP 501) **plus** a zero-backend *portable single-file HTML snapshot*. Neither exists. **MISSING** (the KV/R2 half will be `ENV-LIMITED` when built).

**#29 Templates gallery + remix** — 10 template modules (`src/templates/*`), live-compiled miniature previews (`templatePreview.ts`, `TemplateCard.tsx`), plugin template registry (`core/plugins.ts`); 3 unit-test files + 8 e2e references. **VERIFIED**.

**#30 Comments on preview elements** — pinned DOM-selector annotations dispatching targeted edits; needs shared state → **TRACK-B**.

**#31 Real-time co-editing** — Yjs CRDT over WebRTC/relay with checkpoints as merge anchors → **TRACK-B**.

#### Deploy & Ops
**#32 One-click deploy + domain + SSL + rollback** — Netlify/Vercel/Cloudflare direct deploy (`hosts.ts`, mocked-fetch unit tests only; real deploys need the user's tokens) and GitHub Pages workflow (`github.ts`). *Gap:* no persisted deployment history, no checkpoint-linked rollback, no domain/SSL checklist. **PARTIAL**.

**#33 Environment per stage** — stage-scoped env profiles + target mapping + badge. **MISSING**.

**#34 Logs, error tracking, uptime** — Track A local diagnostics bundle (`diagnostics.ts`, `DebugTab.tsx`). Edge ingestion/uptime = Track B. **PARTIAL**.

**#35 Analytics + billing primitives** — local usage/cost telemetry; Stripe checkout/webhook scaffolds. Stripe appears only as a connector brand/template string. **MISSING**.

#### Design & Theme
**#36 Theme studio** — token editor with font search, plugin themes and live preview bridge (`ThemeStudio.tsx`, `theme.ts`); **no tests**. **PARTIAL**.

**#37 Component library browser** — curated React + Tailwind v4 blocks with live preview + checkpointed insert. **MISSING**.

**#38 Responsive + a11y checker** — in-iframe collector (`a11y:run`), WCAG contrast (`a11yChecks.ts` math VERIFIED), label/alt, 44 px targets, multi-width overflow, "Fix all with AI". Only the math exists. **PARTIAL**.

#### Trust & Safety
**#39 Permission prompts** — unified policy engine + inline Approval Cards. Today `gate()` (`store/prefs.ts`) enforces only `projectEdits` and `publishing` through toast / `window.confirm`; `build` and `connectors` are stored, not enforced; no destructive-action gating. **PARTIAL**.

**#40 Secrets vault + leak detection** — PBKDF2→AES-GCM-256 vault is VERIFIED (`vault.ts`, tests); `leakScanner.ts` (regex + entropy, `publishBlockers`) is unit-tested but **called from nowhere** — no preview/Git/deploy blocking. **PARTIAL**.

**#41 Audit log + quotas** — filterable local action log and soft token/run caps. **MISSING**.

## 5 · Agent needs & engineering self-critique
What an AI agent needs to behave like an engineer, and whether UnQStudio gives it that **today**. Update the row (and §6) whenever a need closes.

| Need | Today | Status |
|---|---|---|
| Run checks (type-check, build) and read the result | esbuild errors + console errors via `selfHeal.ts`; no TypeScript checking | PARTIAL |
| *See* the running app (DOM, console, network, pixels) | Bridge audit exists; not auto-run, no screenshots fed to the model | PARTIAL |
| Search the whole repo | Regex repo map + XML read/grep tags; BM25 brain not wired | PARTIAL |
| Safe undo | Checkpoints, per-turn undo, locks | VERIFIED |
| Approval gates for risky actions | 2 of 4 gates, toast/confirm | PARTIAL |
| Persistent rules across sessions | Prefs memory; no `/.unq/rules.md` | PARTIAL |
| Ask questions mid-task | No | MISSING |
| Resume after interruption | Stream continuation core only; no run state | PARTIAL |
| Prove its claims | `verifyLoop.ts` logic; no receipt UI | MISSING (UI) |

**Self-critique (honest).** The recurring failure mode of this repo has been *building core modules and tests without wiring them* (v3.5.0/v3.6.0 added 10+ modules with zero production importers). From now on a capability is not credited until a production import path, a UI surface and a test exist; the matrix reflects that.

## 6 · Ground-truth tally (v3.6.1 — regenerate when statuses change)
| Status | Count | IDs |
|---|---|---|
| VERIFIED | 5 | 10, 13, 14, 20, 29 |
| PARTIAL | 22 | 1, 2, 3, 4, 5, 7, 9, 12, 15, 17, 18, 19, 23, 24, 25, 26, 32, 34, 36, 38, 39, 40 |
| MISSING | 10 | 6, 8, 11, 16, 27, 28, 33, 35, 37, 41 |
| ENV-LIMITED | 0 | (sub-features only: #19 cloud sync, #28 KV/R2, #32 real deploys need user credentials) |
| TRACK-B | 4 | 21, 22, 30, 31 |
| **Total** | **41** | |

## 7 · Phased execution order
| Release | Scope | Closes |
|---|---|---|
| v3.6.1 | This document + governance wiring | docs only |
| v3.7.0 | Native tool calling on the wire, bundled TS worker + CodeMirror squiggles, auto-run DOM/vision audit, `✓ Verified` receipt, fast-model routing | #1 #2 #4 #9 #16 |
| v3.8.0 | Project Brain in context, `/.unq/rules.md`, `ask_user` card, per-hunk diff UI, leak-scanner blocking, `.env` editor, inline permission cards | #3 #6 #7 #11 #12 #39 #40 |
| v3.9.0 | Deploy history/rollback + stages, `/api/share` + portable HTML, visual ERD + auth/storage scaffolds, npm manager, a11y audit, asset drop, component browser, insights/audit log | #15 #17 #24–#28 #32 #33 #37 #38 #41 |
| v4.0.0 | Flagship UI/UX pass, full e2e + visual QA, truth-sync of every doc | polish |
| Later (Track B) | `IRuntimeEngine` container adapter, server cron/queues, Yjs, hosted metering | #21 #22 #30 #31 #34/#35 hosted halves |
**30-day cadence:** week 1 = v3.7.0, week 2 = v3.8.0, week 3 = v3.9.0, week 4 = v4.0.0 polish + QA. Each release ships only after the full gate suite passes.
