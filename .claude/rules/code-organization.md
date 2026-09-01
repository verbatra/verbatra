# Code organization

Binding conventions for file and type placement across the verbatra monorepo. Every claim below
is grounded in a specific file; check that file before assuming a rule has drifted.

## Barrel exports are package-root-only

Every package has exactly one barrel: `packages/<name>/src/index.ts`. Confirmed with
`find packages -name "index.ts"`, which returns exactly eight files, one per package
(`ai-providers`, `cli`, `core`, `exchange`, `format-adapters`, `mcp`, `sdk`, `studio`), all at the
package's `src` root. No subfolder anywhere in the repo (`format-adapters/src/xliff/`,
`ai-providers/src/deepl/`, `mcp/src/tools/`, and so on) has its own internal `index.ts`.

Do not add one. An internal barrel re-exporting a subfolder's files is a known ecosystem
anti-pattern: it hurts tree-shaking, risks circular-import cycles between sibling modules, and
slows incremental rebuilds, since a change to any file behind the barrel invalidates everything
that imports the barrel itself. Angular's official style guide dropped its own barrel
recommendation in a 2024 RFC for exactly these reasons, converging on the same shape this repo
already has: a single public-surface entry point per package, with internal modules imported by
their real path.

## No path aliases; cross-package imports use real workspace package names

No `tsconfig*.json` under `packages/*` defines a `paths` map. Confirmed with
`grep -rn '"paths"' tsconfig*.json` across the repo (excluding `node_modules`): the only two hits
are `apps/docs/tsconfig.json` (`"@/*": ["./*"]`, a Next.js convention for the docs app's own
source, unrelated to workspace packages) and `scripts/dts-fixture/tsconfig.json`
(`"@verbatra/sdk": ["../../packages/sdk/dist/index.d.ts"]`, a build-verification fixture that
deliberately points at the built `.d.ts` output to catch published-type regressions, not a
monorepo source alias). Cross-package imports everywhere else resolve through the real
`@verbatra/<name>` package name, linked by pnpm's workspace protocol.

Keep it that way. A `@scope/package-name` import resolved through pnpm's real workspace linking
works identically across every tool in the chain (`tsc`, Vitest, tsup) with zero extra
configuration. A `paths` map does not: it needs matching, separately maintained resolution
configuration in each consumer (a bundler, a test runner, `ts-node`/`tsx`), and drift between
those configurations is a well-documented source of monorepo friction. Do not add a `paths` map to
a package's `tsconfig.json` to shorten an import; import the workspace package by its real name.

## Types placement: a type lives in the file that owns its concept

A type or interface lives in the file that owns the concept it describes: a config type in
`config.ts`, a request shape in `request.ts`, a response shape in `response.ts`, run summaries in
`summary.ts`. The type is not a byproduct of that file's logic; in files like these, the shape is
the module. Reuse count is not what decides placement: a type does not move into a generic
`types.ts` just because a second sibling file starts importing it. A folder earns its own
`types.ts` only when the types it holds have no single owning module in that folder.

- `packages/sdk/src/flow/summary.ts` (215 lines) is almost entirely type and interface
  declarations (`SdkNoticeCode`, `UsageSummary`, `RunBudget`, `SdkNotice`, `LocaleNotice`,
  `NeedsReviewEntry`, `MalformedRowReport`, `DuplicateKeyReport`, `LocaleSummary`, `RunSummary`).
  Eight sibling files import from it (`batching.ts`, `budget.ts`, `locale-failure.ts`,
  `locale-run.ts`, `plural-categories.ts`, `plural-generation.ts`, `translate-project.ts`,
  `usage.ts`), plus several `*.test.ts` files in the same folder. It is correctly named
  `summary.ts`, not `types.ts`: "summary" is the concept these types describe, and that concept
  owns the file regardless of how many siblings import it.
- `packages/studio/src/app/panel-props.ts` (3 lines, one interface: `PanelProps`) is consumed by
  `App.tsx` and three files under `panels/` (`ReviewPanel.tsx`, `ActivityPanel.tsx`,
  `TranslationsPanel.tsx`). Same reasoning: `PanelProps` is the concept, the file name already
  states it, and four consumers is not a reason to rename it to `types.ts`.
- `packages/ai-providers/src/deepl/types.ts` is correctly a `types.ts`, precisely because the
  DeepL SDK's wire and response shapes it holds (`DeepLTextResult`, `DeepLTranslateOptions`,
  `DeepLTranslateClient`, `DeepLClientBundle`, `DeepLTranslateResult`) have no single owning
  module in that folder: `client.ts`, `request.ts`, `response.ts`, and `deepl-provider.ts` each
  consume them, and none of those files owns the concept more than another. Contrast this with
  `anthropic/config.ts`, `gemini/config.ts`, `openai/config.ts`, and `openai-compatible/config.ts`,
  each of which declares its own provider's config type (`AnthropicConfig`, `GeminiConfig`,
  `OpenAiConfig`, `OpenAiCompatibleConfig`) inline in `config.ts` rather than in a shared
  `types.ts`, because "config" is the owning module there.

Do not move a type out of a semantically-named file (`config.ts`, `request.ts`, `summary.ts`, and
so on) into a generic `types.ts` just because it gains a second sibling importer. Reuse count is
not the trigger; absence of an owning module is.
