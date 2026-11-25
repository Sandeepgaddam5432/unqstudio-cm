# UnQStudio user guide

## Basic users — "just build it"
1. **Home**: type what you want (or click a template chip, then the arrow). Press ✨ to have the model rewrite a vague idea into a rich prompt (Revert undoes it).
2. **Connect a model** (30 s): model pill → *Quick setup* → pick a provider → paste key → *Test connection* → *Use*. Free tiers: OpenRouter (“:free” models), Gemini, Groq, Cerebras, GitHub Models, or local Ollama / LM Studio.
3. **Studio Mode**: chat on the left, live preview on the right. Every AI turn shows step cards (files created/patched with +/− lines). **Undo turn** restores the previous state; the top-bar ↶ ↷ move along checkpoints.
4. **Edit visually**: click the cursor icon in the preview toolbar, click any element, change text/colors/padding/radius/size, then *Save to source* — or *Edit with AI*.
5. **Theme Studio** (right-panel *Theme* tab): presets, light/dark tokens, radius, Google Fonts — live.
6. **Publish**: download a runnable ZIP, push to GitHub/GitLab, or deploy to Netlify/Vercel.

## Vibe coders
- **Modes**: *Build* edits files, *Plan* returns an architecture blueprint (then **Approve & Build**), *Ask* answers without touching files.
- **Context**: `@src/App.tsx` or `@folder` in a message; pin files in the explorer or Tokens tab; attach/paste/drop screenshots (PNG/JPG/WebP) for screenshot-to-code; dictate with the mic.
- **Rules library** (book icon / Settings → Prompts): reusable system prompts, toggled per chat.
- **Safety**: lock a file or folder (🔒) and the agent will skip it and tell you; enable *Approval tray* to review each change; fork any chat turn into a new project.
- **Errors**: build/runtime errors show a banner with **Fix with AI** (sends error + file context). Optional auto-fix (Settings → Features).
- **Cost control**: header meter shows session tokens, next-request context estimate and approximate cost.

## Pro developers (`⌘E` Code Mode)
- Explorer: create/rename/duplicate/delete, drag-to-move, upload, lock, pin-to-AI. Multi-tab CodeMirror 6 with autosave; search & replace across files (regex / case / word; locked files are never replaced).
- Diff viewer: split/unified, compare with any checkpoint, per-file Accept/Revert (from AI step cards or the History panel).
- Console tab shows `console.*`, runtime errors and build logs; Tokens tab breaks down what is sent to the model.
- `⌘K`: files, actions, AI mode, model, template, theme. Folder sync via File System Access API (Chromium browsers).
- Extensibility: Settings → Features — flags, custom themes/templates/OpenAI-compatible providers, remote MCP connectors (HTTP/SSE, CORS required), registry JSON import/export.
- Data: full JSON backup/restore, storage meter, bulk chat deletion, selective clear, factory reset. Debug: event log + diagnostics report (never includes keys).

## Known browser limits (by design of a static app)
Cloudflare's API blocks browser CORS (use Git-connect guide); some LLM providers do not allow browser origins; Tailwind in deployed single-file bundles uses the Tailwind browser runtime from a CDN
(push to Git for a conventional pre-built Vite site); MCP stdio servers cannot run in a browser.
