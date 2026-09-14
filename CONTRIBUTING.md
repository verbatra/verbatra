# Contributing to verbatra

Thanks for your interest in contributing. verbatra is an i18n translation
automation tool built as a pnpm + Turborepo monorepo. This guide describes the
setup, commands, and conventions this repository actually enforces.

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).
To report a security issue, follow [SECURITY.md](SECURITY.md); please do not
open a public issue for vulnerabilities.

## Prerequisites

- Node.js >= 22.14.0
- pnpm >= 11 (the repository pins pnpm 11.6.0 via the `packageManager` field; run
  `corepack enable` to use the pinned version)

## Setup

Clone the repository and install dependencies from the root:

```
pnpm install
```

This installs every workspace package and sets up the Git hooks (lefthook
installs them during install). If the hooks are not active, run
`pnpm exec lefthook install` once.

## Commands

Run all commands from the repository root; Turborepo orchestrates the per-package
tasks.

- `pnpm build` - build all packages
- `pnpm test` - run the test suites (Vitest) with coverage
- `pnpm lint` - lint all packages (Biome)
- `pnpm check` - run Biome lint and format checks across the repository
- `pnpm format` - apply Biome formatting
- `pnpm knip` - report unused files, exports, and dependencies

`pnpm knip` is informational and is not part of `pnpm verify` or of any required
check. It exits non-zero when it has findings, so read them and decide; the
`Unused code` workflow runs it with `--no-exit-code` and reports in the step log.
Every suppression lives in `knip.config.ts` with the structural reason for it, so
add a new one only when the repository's layout genuinely explains the finding.

Run a task for a single package with a filter, for example:

```
pnpm --filter @verbatra/core test
```

## Tests and coverage

Tests use Vitest and live next to the code as `*.test.ts` files. Coverage is
collected with the v8 provider, and every package enforces a 90% threshold on
lines, functions, statements, and branches. New behavior ships with tests and
must keep coverage at or above that threshold.

## Commit convention

This repository uses [Conventional Commits](https://www.conventionalcommits.org),
enforced by commitlint (`@commitlint/config-conventional`) through the
`commit-msg` Git hook. Write subjects as `type(scope): summary`, for example
`feat(cli): add init command`. Commit body and footer lines must not exceed 100
characters (the configured `body-max-line-length` and `footer-max-line-length`).

The `pre-commit` hook runs Biome on staged files, so format and lint problems are
caught before a commit is created. If the hook reports issues, run `pnpm check`
to see them or `pnpm format` to auto-fix, then re-stage.

## Changesets

If your change touches the `src` of a publishable package and should ship in a
release, add a changeset:

```
pnpm changeset
```

Describe the change and select the affected package(s) and bump type. Changes
that do not affect published packages (for example internal tooling) do not need
one.

## Pull requests

1. Branch from `main`.
2. Make your change with tests, and keep it focused.
3. Run `pnpm verify` locally and make sure it passes. It runs exactly the checks
   the CI build-and-test job runs, in the same order, including the guards that
   are easy to miss (the em dash guard, the published-declaration and studio
   bundle guards, the build config typecheck, and the root script tests). A test
   fails if the two ever drift apart.
4. Use Conventional Commit messages.
5. Add a changeset if a publishable package changed.
6. Open a pull request with the template, describing what changed and how you
   tested it. Keep the pull request scoped and make sure CI is green.

A maintainer will review your pull request. Please be responsive to feedback, and
hold to the standards in the [Code of Conduct](CODE_OF_CONDUCT.md).

## Adding a provider or a format adapter

These are the two extension seams the codebase is designed around. Both are
mechanical: follow the ordered list, and the type system tells you when a step is
missing. Open an issue first if the design is unusual (a provider that is neither
a language model nor a machine-translation API, or a format that fits neither
adapter factory), but a conventional addition needs no design discussion.

Line numbers below are given as "around", because they move. The file path and
the symbol name are what you should search for.

### Architecture rules that bind both

- SDK-first. Business logic lives in `@verbatra/sdk` and below. The CLI stays a
  thin wrapper; do not push logic into it.
- The dependency direction is acyclic and one-way:
  config <- core <- format-adapters / ai-providers / exchange <- sdk <- cli.
  Never import against the arrow.
- `@verbatra/core` stays pure: no I/O, no network, no file system.
- zod belongs at boundaries only (config, CLI args, provider responses), not in
  hot paths.
- No `any`, cognitive complexity capped at 15, Vitest tests co-located as
  `*.test.ts`, 90% coverage.

### Adding a translation provider

Work inside `packages/ai-providers` first, then wire it up in `packages/sdk`.
Replace `<provider>` with the provider id and `<Name>` with its PascalCase name.

1. **`packages/ai-providers/src/<provider>/config.ts`** - the zod options schema
   and the config type inferred from it. Follow `anthropic/config.ts`: a plain
   `z.object` extended with `requestTimeoutConfigSchema.shape`. The schema must
   never contain a field for an API key.

2. **`packages/ai-providers/src/<provider>/<provider>-provider.ts`** - the
   `create<Name>Provider` factory, returning a `TranslationProvider`. There are
   two shapes, and which one you have depends on what the upstream API does:

   - A **language model** you prompt with instructions and JSON. Set
     `kind: "llm"` and route through the shared layer at
     `packages/ai-providers/src/llm/run.ts`: implement an `LlmMechanism` that
     performs the one HTTP call and returns the raw completion, then make
     `translateBatch` call `runLlmTranslation(request, mechanism)`. Anthropic,
     OpenAI, Gemini and openai-compatible all do this. Do not fork the shared
     layer, the system rules, or the canonical response schema: they are what
     enforce the prompt-injection boundary and schema-bound output.
   - A **machine-translation API** that takes strings and returns strings, with
     no prompt. Set `kind: "machine-translation"` and implement `translateBatch`
     directly. DeepL and Google Cloud Translation are the two such providers
     today; see `deepl/deepl-provider.ts` and
     `google-translate/google-translate-provider.ts`.

   The `kind` field is descriptive, not dispatch. Nothing branches on it; both
   kinds satisfy the same interface. Choose by asking whether you send a prompt.

   Errors must be structured `ProviderError`s. Never let a raw upstream SDK error
   escape.

3. **`packages/ai-providers/src/env.ts`** - key handling. Add the entry to
   `PROVIDER_ENV` (around `:3`) and a `require<Name>Key()` helper next to the
   existing five (around `:19-37`), both delegating to `readRequiredEnv`.

   This is a hard rule, not a convention: **API keys come only from environment
   variables. Never from a config file, never from a CLI argument, never from a
   function argument.** An error message names the variable and never contains a
   key value. If your provider needs a user-selectable variable name, follow
   `resolveOpenAiCompatibleKey` (around `:38`) rather than inventing a third
   pattern, and note that it still only ever reads `process.env`.

4. **`packages/ai-providers/src/scaffold.ts`** - only if `verbatra init` should
   offer the provider. Add a default model to `SCAFFOLD_MODELS` (around `:5`) and
   the name of its output-token-limit option to `SCAFFOLD_TOKEN_LIMIT_KEYS`
   (around `:11`). The `satisfies` clause (around `:15-19`) constrains each value
   to `keyof <Name>Config`, so a wrong option name is a compile error rather than
   a config the scaffolder writes and the schema then rejects.

   Skipping this step is legitimate. DeepL takes no model and no token limit and
   appears in neither table, which `scaffold.test.ts` asserts (around `:13-17`).

5. **`packages/ai-providers/src/index.ts`** - export the factory and the config
   schema. The SDK imports both from the package root.

6. **`packages/sdk/src/config/provider-config.ts`** - add the variant to the
   `providerConfigSchema` discriminated union (around `:22-31`). Call `.strict()`
   on the options schema exactly as the others do, so an option belonging to a
   different provider is reported as an error instead of silently ignored.
   Without this variant, config loading rejects the provider outright and nothing
   downstream ever runs.

7. **`packages/sdk/src/config/provider-config.ts`** - add the entry to
   `providerFactories` (around `:57-63`). **This is the registration step.**
   `buildProvider` (around `:71`) reads this table, `selectProvider`
   (`packages/sdk/src/selection/select-provider.ts`, around `:15-18`) wraps it,
   and the two call sites are `flow/translate-project.ts` (around `:496`) and
   `flow/retranslate-entry.ts` (around `:138`).

   `ProviderRegistry` in `packages/ai-providers/src/registry.ts` is **not** the
   registration path. It is exported from the package, but nothing outside its
   own tests imports it, and no runtime code resolves a provider through it.
   Registering there and stopping produces a provider that compiles, appears
   registered, and is never reached. `providerFactories` is the table that
   matters.

8. **`packages/sdk/src/config/provider-billing.ts`** - add the entry to
   `PROVIDER_BILLING`: whether the provider bills by `tokens` or by `characters`,
   and whether a hosted API bills for it at all. The table is a mapped type over
   `ProviderId`, so a missing entry is a compile error, and
   `provider-billing.test.ts` fails it a second time by iterating `PROVIDER_IDS`.
   If the provider takes a model, add its case to `modelOf` in the same file so a
   rate can be filed under `provider/model`; the switch is exhaustive and will not
   compile without it. This is what `translate --estimate` reads.

9. **`packages/sdk/src/scaffolding.ts`** - nothing to edit, but expect a compile
   error here if you skipped step 3 or step 4 for a scaffoldable provider.
   `_envCoversAllProviders` (around `:12`) requires an env entry for every
   provider except `openai-compatible`, and
   `_tokenLimitKeysCoverAllModelProviders` (around `:17`) requires a token-limit
   key for every one of those except `deepl` and `google-translate`, the two that
   take no model. Both are unused declarations that exist only to fail the
   build.

10. **Tests.** A `*.test.ts` beside each new file, covering the happy path, the
    missing-key error, and upstream failures mapped to `ProviderError` codes.

11. **A changeset** (`pnpm changeset`). `@verbatra/sdk` and `@verbatra/cli` are
    published and version-locked together, so a change here ships in a release.

12. **Docs.** Add the provider to `apps/docs/content/docs/(configure)/providers.mdx`
    and to `(configure)/config-file.mdx`, and update the `.de.mdx`, `.es.mdx` and
    `.fr.mdx` sibling of each in the same change. If `verbatra init` offers the
    provider, add it to the `--provider` list in `apps/docs/lib/ai-setup-prompt.ts`
    too; `ai-setup-prompt.test.ts` only checks that constant against the fenced
    block in the four `start-with-ai` pages, so it catches a stale page but never
    a provider you forgot to add to both.

13. **`skills/verbatra-cli/SKILL.md`** - add the row to the Providers table,
    naming the environment variable from step 3.
    `scripts/verify-skills-tool-parity.test.mjs` asserts that table against
    `providerFactories` and `PROVIDER_ENV`, so a missing row fails
    `pnpm test:scripts` rather than shipping a skill that tells an agent the
    provider does not exist.

### Adding a format adapter

Work outward from `packages/core`, then `packages/format-adapters`. Replace
`<format>` with the format id and `<Format>` with its PascalCase name.

1. **`packages/core/src/model/supported-format.ts`** - add the member to
   `SUPPORTED_FORMATS` (around `:3`). The set is closed by design: a format
   outside it cannot be represented at all. The doc comment on
   `supportedFormatSchema` states the rule and lists what each member means, so
   extend that list too.

2. **`packages/format-adapters/src/<format>/<format>-adapter.ts`** - the
   `create<Format>Adapter` factory. Build on a shared factory; do not implement
   `FormatAdapter` by hand, and do not reimplement read, write, or detection
   logic. Pick by the file's shape:

   - **Nested tree** (a value lives at a path of keys): use
     `createTreeFileAdapter` from `json/tree-file-adapter.js`. Supply `parse`,
     `serialize`, the extensions, and the placeholder functions.
     `yaml/yaml-adapter.ts` is a compact example, at 23 lines.
     `createJsonFileAdapter` (`json/json-file-adapter.js`) is its JSON
     specialization, pinning `.json`, the JSON parser, serializer, and sniffer;
     the four JSON adapters use it. It is internal to the package, not exported
     from the package root, so import it by relative path.
   - **Flat key/value** (one line, one key, no nesting): use
     `createFlatFileAdapter` from `flat/flat-file-adapter.js`. Supply
     `parseEntries`, `serializeEntries`, and the placeholder extractor.
     `properties/properties-adapter.ts` is the example, at 16 lines.

   A format that genuinely fits neither shape implements `FormatAdapter` from
   `adapter.ts` directly, but raise that in an issue first.

   **The file system is a port.** Your factory takes
   `fs: AdapterFs = nodeAdapterFs` as its first parameter and passes it straight
   into the shared factory's options, exactly as every shipped adapter does.
   Never import `node:fs` or `node:fs/promises` in an adapter.
   `fs-port.no-direct-node-fs.test.ts` scans every non-test source in the package
   and fails on any file except `fs-port.ts` that imports the file system,
   prefixed or not, static or dynamic.

3. **`packages/format-adapters/src/default-registry.ts`** - add
   `.register(create<Format>Adapter(fs))` to the chain in `createDefaultRegistry`
   (calls around `:14-21`). Forward the `fs` parameter; do not let the default
   apply here.

4. **`packages/format-adapters/src/index.ts`** - export the factory.

5. **Tests.** A `*.test.ts` beside the adapter, including a round-trip test:
   read a fixture, write it back, and assert the output is byte-identical.
   Key order and structure must survive the round trip.

6. **A changeset** (`pnpm changeset`).

7. **Docs.** Add the format to `apps/docs/content/docs/(configure)/formats.mdx`
   and its `.de.mdx`, `.es.mdx` and `.fr.mdx` siblings. Also update
   `apps/docs/lib/structured-data.ts`, where `FORMAT_LABELS` (around `:12-21`) is
   a total `Record<SupportedFormat, string>` and will not compile until the new
   format has a display label. That one is easy to miss, and the error surfaces
   in the docs app rather than where you were working.

   `apps/docs/lib/ai-setup-prompt.ts` names the format set in several places: the
   detection list, the mapping from file shape to format id, the two warnings
   about what `verbatra init` cannot auto-detect, and a caveat paragraph where the
   format needs one. Nothing compares that constant to `SUPPORTED_FORMATS`, so
   nothing fails if you skip it. Do it here, and grep the file for a neighbouring
   format id rather than trusting one edit to have covered every mention.

8. **`skills/verbatra-cli/SKILL.md`** - add the row to the Formats table.
   `scripts/verify-skills-tool-parity.test.mjs` asserts that table against
   `SUPPORTED_FORMATS`, so a missing row fails `pnpm test:scripts` rather than
   shipping a skill that tells an agent the format is unsupported.

### Formats assessed against the factories

A format that looks close to one already shipped does not always fit a shared
factory. The record below is what assessing four candidates against the current
code concluded, so the same ground is not re-walked every time one of them is
proposed again. `apple-xcstrings` remains the only adapter that implements
`FormatAdapter` by hand, and it stays an exception rather than a pattern.

| Format | Factory fit | Verdict | Reason |
| --- | --- | --- | --- |
| .NET `.resx` | `createFlatFileAdapter` | shipped | Flat `<data name>`/`<value>` elements under one root, the same shape XLIFF and Android `strings.xml` already ride on. |
| INI | `createFlatFileAdapter` | shipped | One section level, one line per key, every value a string. `properties` is the template for the file shape, `vue-i18n` for the placeholder syntax. |
| TOML | `createTreeFileAdapter` | deferred | Needs a third-party parser as a new runtime dependency, and an order-preserving one; neither was settled here. |
| Fluent `.ftl` | neither | deferred | Not key/value. Needs a syntax tree and a unit-of-translation decision first. |

**`.resx`** is flat XML: `<data name="Key"><value>text</value></data>` under a
`<root>` that also carries an XSD schema preamble and several `<resheader>`
elements. None of that is an obstacle, because `serializeEntries` receives
`(entries, filePath, fs)` and can re-read the destination document and patch
only the values it has entries for, leaving every other byte alone. That is the
same write path `serializeXliffEntries` uses. It claims `.resx` only, never
`.xml`, so the Android adapter's claim on `.xml` stays unambiguous. Placeholders
are .NET composite formatting (`{0}`, `{0,-10}`, `{1:C}`, with `{{` and `}}` as
literals), which needs its own extractor: neither the single-brace extractor nor
the MessageFormat one recognizes an alignment or format specifier as part of the
token. The format has no plural construct, so no plural path is involved. One
file per locale (`Resources.resx`, `Resources.de.resx`), which is what both
factories assume. No new dependency: `@xmldom/xmldom` is already here.

**INI** is one section level, one line per key, every value a string, no typed
scalars and no nesting beyond the section. Sections collapse into dotted keys on
read through the same segment encoding `flattenTree` uses, and are rebuilt on
write. It has no plural construct and no canonical placeholder syntax at all, so
the adapter guards single-brace tokens (`{name}`, `{0}`), the most common
convention in the files that do interpolate; that is `vue-i18n`'s extractor, not
`properties`' MessageFormat one, so `properties` is the template for the file
shape only. One file per locale. No new dependency: the parser is a few dozen
lines, like `properties`.

**TOML** would ride `createTreeFileAdapter`, not `createFlatFileAdapter`: it has
nested tables, arrays of tables and typed scalars (integers, floats, booleans,
offset date-times), none of which the flat factory models. `yaml-adapter.ts` is
the shape it would take. Two things block it rather than the factory choice.
First, it needs a third-party TOML parser and serializer as a runtime dependency
of a package tsup inlines straight into the published SDK, which is a
supply-chain decision worth taking on its own. Second, the tree factory needs a
parser that preserves declaration order for quoted integer-like keys, so that
`"10"` before `"2"` survives a round trip; YAML gets that from the `yaml`
package's `mapAsMap` option, and a parser that returns plain objects cannot
provide it. Neither question was answered here, so TOML is not shipped.

**Fluent** (`.ftl`) fits neither factory, and not because of file layout. It is
not key/value: one message can carry both a value and named attributes
(`login.title = X` with an indented `.placeholder = Y`), terms (`-brand-name`)
are a separate namespace that is referenced but never translated as a standalone
unit, and select expressions with variants are plural and gender branching
inline in a single message body. Placeables (`{ $var }`, `{ -term }`,
`{ NUMBER($n) }`) are not flat tokens a regex can lift out the way every shipped
`extractPlaceholders` does. Round-tripping it needs a real syntax tree and, more
importantly, a decision about what one `TranslationEntry` corresponds to before
any code is written. Per the rule above, raise that first.

### The guards are the guide

Every step above that can be enforced at compile time already is, which is why
this list can be trusted even after the line numbers drift:

- the `satisfies` clause on `SCAFFOLD_TOKEN_LIMIT_KEYS` rejects an option name
  that does not exist on the provider's config,
- `_envCoversAllProviders` and `_tokenLimitKeysCoverAllModelProviders` in the SDK
  fail the build when a scaffoldable provider has no env entry or no token-limit
  key,
- `SUPPORTED_FORMATS` is a closed `as const` tuple, so an unlisted format is not
  expressible,
- `FORMAT_LABELS` is a total record over `SupportedFormat`, so a new format
  cannot ship without a label,
- and `fs-port.no-direct-node-fs.test.ts` fails on a direct file-system import
  anywhere in the adapter package.

If you find yourself wanting a new lint rule or checklist item, check first
whether one of these already covers it.

## Refreshing the Studio screenshots

The documentation site ships real screenshots of Verbatra Studio, in
`apps/docs/public/screenshots/`. They are generated, not hand-made, so a Studio
UI change makes them stale and they have to be regenerated rather than edited.

The capture harness is `apps/docs/scripts/capture-studio.mjs`. It boots the
locally built CLI against a committed fixture project, drives Chromium with
Playwright, and writes one WebP per panel per theme.

To refresh them:

```
pnpm build
pnpm --filter @verbatra/docs exec playwright install chromium
pnpm --filter @verbatra/docs run screenshots
```

`pnpm build` is required: the harness runs `packages/cli/dist/index.js` and
Studio serves its dashboard from `packages/studio/dist/app`, and neither is
committed. The browser binary is a separate step on purpose. `playwright` is
listed in `allowBuilds` as `false` in `pnpm-workspace.yaml`, so a plain
`pnpm install` never downloads a browser, and no CI job does either. Only the
person refreshing the images pays that cost.

The fixture is `apps/docs/scripts/studio-fixture/`, and it is committed so the
screenshots are reproducible. It holds a small storefront project: a config with
an inline glossary, an English source locale, and `de`, `es` and `fr` targets
deliberately left at different levels of completeness so the coverage numbers
are not all identical. `run-status.seed.json` is the recorded-run artifact that
populates the Review queue; the harness copies it to
`.verbatra-local/run-status.json` on each run, because that directory is
gitignored. No API key is involved and no provider is ever called.

Two conventions to preserve:

- **Studio is captured in English only.** The alt text and captions are
  translated in every locale, but the UI in the image stays English. Capturing
  four locales would quadruple the asset count and the refresh cost for very
  little gain, and English-UI screenshots under translated alt text is the
  normal convention. Do not "fix" this by adding locale variants.
- **Both themes, always.** Studio ships light and dark, and the docs render the
  pair behind a toggle (`apps/docs/components/studio-screenshot.tsx`). Note that
  the docs site itself is dark-only by design, so that toggle switches the image
  and nothing else. Adding a shot means adding both themes and registering its
  pixel dimensions in that component.
