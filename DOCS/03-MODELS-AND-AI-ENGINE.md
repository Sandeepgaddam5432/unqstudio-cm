# 03 · Models & AI Engine
_(Full v2.0 spec is written in milestone V2-M2; v1 engine summary below.)_

- Streaming adapters in `src/core/ai/stream.ts`: OpenAI-compatible SSE and Anthropic Messages SSE.
- Artifact grammar parsed incrementally by `parser.ts`; edits applied by `patch.ts` (search/replace) and `apply.ts` with checkpoints and file locks.
- API keys are stored by `vault.ts` with Web Crypto AES-GCM (optional passphrase).
