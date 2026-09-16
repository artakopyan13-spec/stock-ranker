# Prompts

Versioned prompt files. `scripts/build-prompts.mjs` bundles the current version into
`src/lib/ai/prompts.generated.ts` (run automatically before `dev`, `build`, and `test`).

- `v1/system.md` — the frozen system prompt. It embeds the `stock-analysis` skill's hard rules,
  the analysis framework, the rating rubric, and the output contract. Stable text first so it
  is prompt-cacheable.
- `v1/analysis_user.md` — the per-request user message template. Placeholders:
  `{{SYMBOL}}`, `{{TODAY}}`, `{{STOCK_DATA_JSON}}`.
- `v1/news_search.md` — used only for the web-search news fallback.

To change a prompt, copy `v1/` to `v2/`, edit, and bump `PROMPT_VERSION` in
`scripts/build-prompts.mjs`. Every stored analysis records the prompt version it was made with.
