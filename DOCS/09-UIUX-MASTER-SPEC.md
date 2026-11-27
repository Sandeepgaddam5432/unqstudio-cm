# 09 · UI/UX Master Spec (v3.1)

> Permanent design record for UnQStudio v3.1. Every future session must read this before touching `src/ui/**` or `src/index.css`.
> Reference feel: Lovable.dev — warm, layered, calm, native-app on mobile. We implement *our own* code; only the visual language is matched.

## 1. OKLCH depth ladder (`src/index.css`)
Surfaces are **layered**, never flat. Depth is expressed with five steps, not borders alone.

| Token | Light | Dark |
|---|---|---|
| `--bg-depth` (page gutter, behind everything) | `oklch(95.49% 0 107)` | `oklch(20.42% .002 107)` |
| `--bg-base` | `oklch(96.99% 0 107)` | `oklch(23% .002 107)` |
| `--bg-primary` (cards, composer, sheets) | `oklch(98.51% 0 107)` | `oklch(24.74% .002 107)` |
| `--bg-secondary` (user bubble, raised) | `oklch(99.99% 0 107)` | `oklch(27.2% .002 107)` |
| `--bg-muted` | `oklch(56.74% .009 106.68 / .16)` | `oklch(56.74% .009 106.68 / .08)` |
| `--bg-translucent` | `oklch(100% 0 0 / .8)` | `oklch(24.74% .002 107 / .8)` |
| `--fg-primary` | `oklch(10% 0 0)` | `oklch(100% 0 0)` |
| `--fg-secondary` | `oklch(30% .001 107)` | `oklch(90.95% .002 107)` |
| `--fg-tertiary` | `oklch(50% .001 107)` | `oklch(72.34% .002 107)` |
| `--fg-quaternary` | `oklch(69% .001 107)` | `oklch(56.74% .002 107)` |
| `--border-depth` | `oklch(82.1% 0 107 / .4)` | `oklch(30.42% .004 107 / .4)` |
| `--bg-accent` (signature, **one accent per view**) | `oklch(52.43% .2396 264.41)` | same |

Legacy v3.0 tokens (`--c-bg`, `--c-panel`, `--c-subtle`, `--c-raised`, `--c-line`, `--c-fg`, `--c-muted`, `--c-faint`) are **aliased onto the ladder** so the existing components inherit the new depth without rewrites. `--c-accent` stays the brand/warm accent for chat chrome; `--bg-accent` (blue) is used for the primary action of a view (Publish).
Rule: no neon, no rainbow buttons, one accent per view.

## 2. Typography
- Families: `Geist Variable` (UI, `font-variation-settings: "wght" 450`), `Geist Mono Variable` (code); fallback Inter / JetBrains Mono (bundled).
- Scale: Home headline desktop `30px/1.15 -0.0225em`; mobile `24px/1.25 -0.015em`; chat prose `16px/22px`; compact labels `14px/1.43`; metadata `12px/1.33`. Utility classes: `.t-headline`, `.t-prose`, `.t-label`, `.t-meta`.

## 3. Shadows (multi-layer hairline rings)
`--shadow-surface-xs`, `--shadow-surface-md`, `--shadow-floating-md`, `--shadow-surface-xl`: each = 1px ring (`0 0 0 1px` in `--border-depth`) + soft contact shadow + ambient shadow. Dark mode swaps the ring to a lighter hairline and deepens the ambient layer. Tailwind utilities: `shadow-xs-surface`, `shadow-md-surface`, `shadow-floating`, `shadow-xl-surface`.

## 4. Motion
hover `150ms ease-out` · spatial `200ms cubic-bezier(.2,0,0,1)` · floating `250ms` · sheets `300ms cubic-bezier(.32,.72,0,1)` · thinking shimmer `1200ms linear`. All collapse under `prefers-reduced-motion`.

## 5. Aurora hero + Dashboard background (`src/ui/home/AuroraBackdrop.tsx`, `src/store/theme.ts`)
- Crisp **SVG** scene (oversized `radialGradient` ellipses), NOT a CSS `filter: blur()`. Masked at top with `linear-gradient(to bottom, transparent 0%, #000 5%)`, clipped to the Home hero (`absolute inset-0 overflow-hidden`).
- Presets: **Classic Aurora**, **Soft Horizon**, **Warm Peach**, **Minimal Monochrome**, **Custom** (user picks two hues). Mode: System / Light / Dark.
- Persisted keys: `unq.theme.mode` (`system|light|dark`), `unq.theme.bg` (preset id), `unq.theme.custom` (`{a,b}` hex JSON).

## 6. Mobile navigation (<768px)
- `MobileBottomNav`: centred floating pill (`rounded-full bg-primary/90 backdrop-blur-md shadow-floating`) with **Home · Projects · Chats**; visible only on those three views, never inside a workspace.
- Home header: left Workspace Switcher pill (avatar badge + name + chevron → workspace sheet), right Account avatar (→ Account sheet).
- Home composer: `28px` radius, optical centre `bottom: calc(55dvh - var(--composer-height) - 14px)`, `max-w-[672px]`, `min-h-[60px]` borderless textarea, left `+` menu (Attach · Import project · Add context · Databases), right **Build ▾** mode popover (Build / Chat [Free pill] / Plan), Mic, 36px inverse circular Send.
- Projects: header (title + Search + Filter), 88px rows (64×72 rounded-xl thumbnail, 14px/500 title, 12px `fg-tertiary` time, pin, `…` menu), floating `+ New project` pill above the dock. Desktop: 16:9 card grid with hover-only actions.
- Chats: header (title + search toggle + filter popover All/Unread/Scheduled/Archived), rows (title, date, file-count badge, `…`), floating `+ New chat`.
- Skeletons (`Skeleton.tsx`): calm 1200ms shimmer; shown ≤ 280ms on view switch and while a project workspace opens; shaped like header pill, avatar circle, composer card and list rows.

## 7. Workspace
- **Mobile**: one `100dvw` horizontal scroll-snap strip (`scroll-snap-type: x mandatory`, two `snap-start` panes: Chat, Preview). No persistent bottom tab bar. Top bar: 44px circular Close (X), centred Project Title pill, 44px `>` button gliding to Preview. Preview floating bottom bar: `‹ Chat` pill, `Click to add` visual-edit toggle, `…` overflow (Refresh · Change page · History · Share · Social & search · Preview in new tab) and blue `Publish` pill.
- **Desktop**: chat rail default 30% (min 320, max 768), 1px seam with 8px hit area; preview sits in an 8px `--bg-depth` gutter, radius 16, `1px --border-depth`, `--shadow-surface-xl`. Top bar 48px: project switcher + undo/redo · segmented `Preview | Code` · quiet controls + 32px accent Publish.
- Chat: user bubble right-aligned `rounded-[24px] rounded-br-[4px] bg-secondary shadow-xs 12/16 padding`; AI = borderless prose `16/22 max-w-[788px]`, hover-only actions on desktop, always visible on touch; 32px follow-up chip row above the composer; composer pinned above keyboard via `visualViewport`.

## 8. Agent transparency (`ActivityInspector`)
- In chat: collapsible `Used X tools ›` row + inline **Version card** (`bg-primary rounded-xl 1px --border-depth shadow-xs`, title + bookmark, **Details** & **Preview** buttons).
- `ActivityInspector`: full-height sheet (mobile) / right drawer (desktop). Segmented **Timeline | + Changes**, summary bar (`Worked for Xm Xs` · steps/tokens). Timeline: chronological steps — `Thought for Xs ›`, `Read`, `Edited`, `Created`, `Typecheck / Build`, `Questions answered`. Changes: expandable per-file cards with `View file`, copy-path, green/red line-numbered diff (built on `core/vfs/lineDiff.ts`).
- Data source: assistant message build activity + version snapshots (`core/ai/versions.ts`); no new network.

## 9. Settings architecture (`src/ui/settings/*`)
- `AccountMenu` (sheet/popover from avatar): account/local profile, Account settings, Connectors, Documentation (Privacy · Changelog · Security · Rules), Appearance (mode + Dashboard Background swatches), log out / guest.
- `AccountSettings`: searchable grouped list — **Preferences** (language, chat suggestions, tips, **message queue**, **generation-complete sound**), **Personalization** (Instructions, Skills [IndexedDB], Memory), **Access & Devices → Permissions** (Project edits, Publishing, Build/Auto-heal, Connectors; each Allow / Ask each time / Deny), and a link to Workspace settings.
- `ConnectorsHub`: search + category pills (Home · All · Enabled · Build · Deploy · Data) + Add custom (→ Custom Providers / HTTP MCP) + cards for GitHub, GitLab, Supabase, Netlify, Vercel, Cloudflare, custom API.
- `WorkspaceSettings`: searchable collapsible groups — Customization (Instructions, Skills, Templates, Design systems), Build & deploy (Git, MCP server, Workspace domains), Security (Privacy & Vault, Data exports).
- Persisted keys (`src/store/prefs.ts`): `unq.prefs` (language, suggestions, tips, messageQueue, completeSound, permissions, instructions, memory). Skills: IndexedDB database `unq-skills`.

## 10. Invariants carried over from v3.0
4-source model catalog; zero upstream-directory UI leaks; 3-layer zero-broken-icon system; 4-protocol custom providers; AES-GCM vault; VFS locks/checkpoints; `esbuild-wasm` runtime; multi-step agent loop; OAuth/cloud sync; `VITE_SITE_URL` SEO/AEO. Layout rules from `AGENTS.md` (min-w-0, `h-[100dvh]` grid, Floating UI popovers) still apply.
