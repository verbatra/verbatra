# Architecture

Binding structural rules for the verbatra monorepo. Every claim below is grounded in a
specific file; check that file before assuming a rule has drifted.

## Dependency direction

Acyclic, one-way, confirmed against every `packages/*/package.json` `dependencies` and
`devDependencies` block:

```
config <- core <- format-adapters / ai-providers <- sdk (+ exchange) <- cli / studio
```

- `@verbatra/core` (`packages/core/package.json`) depends only on `zod`. Nothing below it.
- `@verbatra/format-adapters` depends on `@verbatra/core` (`packages/format-adapters/package.json`).
- `@verbatra/ai-providers` depends on `@verbatra/core` (`packages/ai-providers/package.json`).
- `@verbatra/exchange` (`packages/exchange/package.json`) has no *runtime* workspace dependency
  (`dependencies` lists only `exceljs`/`jszip`/`zod`); its one workspace dependency is
  `@verbatra/config` as a `devDependency`, for shared build/lint/test config only. It does not
  depend on `core`, so it does not sit on the `core <- format-adapters / ai-providers` line; it
  feeds into the sdk independently, parallel to that line.
- `@verbatra/sdk` depends on `@verbatra/core`, `@verbatra/ai-providers`, `@verbatra/exchange`,
  `@verbatra/format-adapters` (all as `devDependencies` because tsup bundles them into
  `dist/index.js`; see `packages/sdk/package.json`).
- `@verbatra/cli` depends on `@verbatra/sdk` only, plus `commander` and `zod`
  (`packages/cli/package.json`). It carries `@verbatra/studio` as a `devDependency` only, reached
  through a dynamic import at runtime (`packages/cli/src/studio-command.ts`), never a static
  import, so a missing or broken studio build never breaks the rest of the CLI.
- `@verbatra/mcp` depends on `@verbatra/sdk` (`packages/mcp/package.json`), the same way `cli`
  does: a thin, sdk-backed surface, here a stdio MCP server rather than a CLI binary. It versions
  independently, like `studio`, not in the `sdk`/`cli` fixed group.
- `@verbatra/studio` depends on `@verbatra/sdk` at runtime (`packages/studio/package.json`
  `dependencies`), not on cli. It also lists `@verbatra/format-adapters` as a `devDependency`
  (`packages/studio/package.json` `devDependencies`); the only source usage is
  `packages/studio/src/server/rpc-gate.test.ts`, which imports `AdapterError` for a test
  assertion. That is a test-only, dev-time edge, not a runtime import against the dependency
  arrow.
- `@verbatra/config` (`packages/config/package.json`) has no workspace dependencies; every other
  package takes it as a `devDependency` for shared tsconfig, biome, tsup, and vitest presets.

Never import against the arrow. Never create a cycle. `packages/sdk/src/config/provider-config.ts`
and `packages/format-adapters/src/default-registry.ts` are the two files where the upward
packages (ai-providers, format-adapters) get wired into the sdk; nothing downstream of sdk should
need to reach back into core, format-adapters, or ai-providers directly except through the sdk's
exported surface.

## SDK-first, CLI and Studio stay thin

Business logic lives in `@verbatra/sdk` and below. `@verbatra/cli`
(`packages/cli/src/run.ts`, the `Command` registrations for `translate`, `watch`, `export`,
`import`, `check`, `diff`, `doctor`, `studio`, `init`) is a thin wrapper: it parses args with zod
schemas, calls into the sdk, and renders the result. `@verbatra/studio` is the local dashboard;
its provider-spending actions (retranslate, translate pending) are gated behind `--allow-spend`
(`packages/cli/src/studio-command.ts`, `packages/studio/src/app/panels/SettingsPanel.tsx`), but
the underlying translate/retranslate logic itself lives in the sdk, not in the studio server or UI.

## Format adapters: build on the two shared factories

Every format adapter goes through one of two factories in `@verbatra/format-adapters`, never
implementing the `FormatAdapter` interface (`packages/format-adapters/src/adapter.ts`) by hand:

- `createTreeFileAdapter` (`packages/format-adapters/src/json/tree-file-adapter.ts`) for
  nested-tree formats: takes `parse`, `serialize`, `deriveEntry`, `extractPlaceholders`, and
  optional validation/comparison hooks, and returns a full `FormatAdapter`.
  `createJsonFileAdapter` (`packages/format-adapters/src/json/json-file-adapter.ts`) is its JSON
  specialization, pinning the JSON parser/serializer/sniffer; the four JSON-shaped adapters
  (i18next, vue-i18n, next-intl, ngx-translate) build on it.
- `createFlatFileAdapter` (`packages/format-adapters/src/flat/flat-file-adapter.ts`) for flat
  key/value formats: takes `parseEntries`, `serializeEntries`, `extractPlaceholders`. Java/Spring
  `.properties` is the shipped example (`packages/format-adapters/src/properties/properties-adapter.ts`).

All twelve shipped adapters (i18next, vue-i18n, next-intl, ngx-translate, XLIFF, YAML, Flutter
ARB, Java/Spring properties, Apple `.strings`/`.stringsdict`, Apple `.xcstrings`, Android
`strings.xml`, gettext `.po`/`.pot`) are registered in `createDefaultRegistry`
(`packages/format-adapters/src/default-registry.ts`). Adding a format means: add the member to
`SupportedFormat` in `packages/core/src/model/supported-format.ts`, build the adapter on the
matching factory, register it in `default-registry.ts`, export it from
`packages/format-adapters/src/index.ts`. Do not reimplement read, write, or detection logic.

One exception: `createAppleXcstringsAdapter` (`packages/format-adapters/src/xcstrings/xcstrings-adapter.ts`)
implements `FormatAdapter` by hand rather than building on either factory. Apple's `.xcstrings`
format holds every locale in one file, read per-locale by an explicit `locale` parameter; both
factories assume one file per locale, so neither shape fits. Do not treat this as license to
hand-roll a new adapter for a format that does fit one of the two factories.

The file system is a port: every adapter factory takes `fs: AdapterFs = nodeAdapterFs`
(`packages/format-adapters/src/fs-port.ts`) and never imports `node:fs` directly.
`fs-port.no-direct-node-fs.test.ts` enforces this by scanning every non-test source file in the
package.

`AdapterRegistry` (`packages/format-adapters/src/registry.ts`) resolves a file to an adapter by
explicit format or by `canHandle` detection, returning a structured `resolved` / `no-match` /
`ambiguous` result rather than throwing.

## Providers: one interface, one factory table (Strategy + Factory)

Every provider implements the single `TranslationProvider` interface
(`packages/ai-providers/src/provider.ts`): `id`, `kind` (`"llm"` or `"machine-translation"`,
descriptive only, nothing branches on it), `supportsGlossary`, and `translateBatch(request)`.

- The four LLM providers (Anthropic, OpenAI, Gemini, openai-compatible) route through the shared
  `runLlmTranslation` layer (`packages/ai-providers/src/llm/run.ts`) by implementing an
  `LlmMechanism` that performs one HTTP call; they share one canonical response schema and one
  set of system rules. Do not fork this layer.
- DeepL and Google Cloud Translation (Basic, v2) are the two `machine-translation` providers and
  implement `translateBatch` directly (`packages/ai-providers/src/deepl/deepl-provider.ts`,
  `packages/ai-providers/src/google-translate/`), since they take strings and return strings with
  no prompt.

Resolution is a factory table, not the exported `ProviderRegistry`:
`packages/sdk/src/config/provider-config.ts` defines `providerFactories`, a `ProviderFactories`
mapped type over `ProviderId` (`"anthropic" | "openai" | "gemini" | "deepl" |
"google-translate" | "openai-compatible"`), so a provider present in the config union but missing
from the factory table fails to compile. `buildProvider(config)` reads this table; `selectProvider`
(`packages/sdk/src/selection/select-provider.ts`) wraps it. `ProviderRegistry`
(`packages/ai-providers/src/registry.ts`) is exported from the package but is not on this path:
nothing outside its own tests resolves a provider through it. Registering a new provider there and
stopping produces something that compiles and appears registered but is never reached at runtime.

Adding a provider: config schema in `<provider>/config.ts`, factory in
`<provider>/<provider>-provider.ts`, key handling in `packages/ai-providers/src/env.ts`
(`PROVIDER_ENV` plus a `require<Name>Key()` helper), export from
`packages/ai-providers/src/index.ts`, then the two `provider-config.ts` steps (discriminated
union variant, `providerFactories` entry). See `CONTRIBUTING.md` "Adding a translation provider"
for the full ordered list with line-number pointers.

## Core stays pure

`@verbatra/core` (`packages/core/src/`: `model/`, `diff/`, `hash/`, `placeholder/`, `validation/`)
has no I/O, no network, no file system, and depends only on `zod`
(`packages/core/package.json` `dependencies`). It holds the domain model
(`LocaleResource`, `TranslationEntry`, `SupportedFormat`), `diffResources`, content/string hashing,
placeholder integrity checking, and validation. Nothing in `core` reads a file, makes a network
call, or imports anything from `format-adapters`, `ai-providers`, `exchange`, `sdk`, `cli`, or
`studio`.

## Boundaries for zod

zod validates at boundaries only: config loading, CLI argument parsing, provider response
schemas. It is not used in hot-path data transformation inside core or the adapters' read/write
loops.
