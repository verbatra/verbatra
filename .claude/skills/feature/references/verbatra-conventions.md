# verbatra project conventions (shared reference)

Every role in this plugin treats the rules below as binding. They come from the
verbatra project definition. When a deliverable would violate one of these, stop
and route the issue back rather than shipping around it.

## Language and style (applies to all repository content)

- All repository content (code, comments, documentation, commit messages, spec
  files, audit notes) is written in English. English overrides any other default.
- No emojis. No decorative formatting. Natural writing style.
- Em dashes (the U+2014 character) must never appear anywhere in the repository.
  Use a spaced hyphen, a colon, or parentheses instead. This is a hard rule and
  it also applies to anything this team writes into the repo.

## Repository

- github.com/verbatra/verbatra. Open source, MIT, npm scope `@verbatra`.
- The connected GitHub tool is read-only here: it can read issues, pull requests,
  and code, but it cannot branch, push, or open pull requests. Deliver all code by
  writing to the local mounted repository, not through GitHub.

## Architecture (binding)

- pnpm workspaces monorepo with Turborepo (task orchestration and caching) and
  Changesets (publishing). Node >=22.14.0, pinned pnpm@11.6.0.
- SDK-first: `@verbatra/sdk` is the central API. `@verbatra/cli` is a thin wrapper.
  Published packages are `@verbatra/sdk`, `@verbatra/cli`, and `@verbatra/studio`;
  the others are internal or private. `cli` and `sdk` are version-locked (Changesets
  `fixed`); `studio` versions independently.
- Acyclic dependency direction:
  config <- core <- format-adapters / ai-providers / exchange <- sdk <- cli /
  framework-adapters. Never import against the arrow. Never introduce a cycle.
- Abstract provider layer (Strategy + Factory). Six providers ship today: OpenAI,
  Anthropic, Gemini (@google/genai), DeepL, Google Cloud Translation (Basic, v2),
  and openai-compatible (a local or self-hosted OpenAI-compatible server such as LM
  Studio, Ollama, or vLLM). The four LLM providers run through the shared
  `runLlmTranslation` layer with one canonical zod schema fed to each SDK's
  structured-output mechanism. DeepL and Google Cloud Translation are MT APIs and
  implement `translateBatch` directly, reusing only cross-cutting pieces. All
  providers sit behind one
  shape-agnostic `TranslationProvider` interface, constructed by the id-to-factory
  table in `packages/sdk/src/config/provider-config.ts` (`buildProvider`) and
  wrapped by `selectProvider`. `ProviderRegistry` is exported from
  `@verbatra/ai-providers` but is not on that path today; keep it, do not treat it
  as the resolution mechanism.
- Format-adapter pattern (Reader / Writer / Parser) over a format-neutral
  intermediate representation. Eight adapters ship today: i18next, vue-i18n,
  next-intl, ngx-translate, XLIFF, YAML, Flutter ARB, and Java/Spring properties.
  All are built on the shared `createTreeFileAdapter` or `createFlatFileAdapter`
  factory and registered via `createDefaultRegistry`. When adding a format, build
  on the matching factory and register it. Do not reimplement read, write, or
  detection.

## Packages

- `@verbatra/config` shared build, TS, and lint config (tsconfig base, Biome
  config, tsup preset).
- `@verbatra/core` pure domain center (model, diffing, hashing, placeholder
  integrity, validation). No I/O, no network, no file system. Depends only on zod.
- `@verbatra/format-adapters` file to neutral-IR adapters for the eight supported
  i18n formats (i18next, vue-i18n, next-intl, ngx-translate, XLIFF, YAML, Flutter
  ARB, and Java/Spring properties).
- `@verbatra/ai-providers` translation provider strategies behind one interface.
- `@verbatra/exchange` translator interchange: builds and reads styled Excel
  workbooks over a neutral, format-agnostic row model.
- `@verbatra/sdk` central orchestration API: one-shot `translate()`, long-running
  `watch()`, read-only `check()` and `diff()`, `exportWorkbook()` and
  `importWorkbook()`, and config loading.
- `@verbatra/studio` (published) the local dashboard, a prebuilt single-page app
  served over a verbatra project, reached only through the CLI `studio` command via
  a dynamic import.
- `@verbatra/cli` the `verbatra` binary, a thin wrapper over the SDK.
- `apps/docs` Fumadocs (Next.js) documentation site.

The composite GitHub Action that runs the CLI in CI is not part of this monorepo.
It lives in github.com/verbatra/action and is consumed via `uses:`.

## Code principles

- Strict TypeScript: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes,
  verbatimModuleSyntax, isolatedModules, NodeNext. No `any` (Biome noExplicitAny is
  an error). Cognitive complexity capped at 15.
- DRY, KISS, SOLID. Clear, descriptive names. Low LOC per function and per file,
  enforced by lint rules.
- zod at all boundaries (config, CLI args, action inputs, provider responses).
  Keep zod out of hot paths.
- Biome for format and most linting. There is no ESLint config in the repo today;
  type safety is enforced by the per-package `typecheck` (tsc) scripts.
- Tests with Vitest, co-located as `*.test.ts`. 90% coverage thresholds on lines,
  functions, statements, and branches in CI.
- Conventional Commits required (commitlint + lefthook). Any publishable `src`
  change ships a changeset. New publishable packages extend `@verbatra/config`
  rather than redefining build or lint settings.

## Security (high priority)

- API keys only from env (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
  DEEPL_API_KEY, GOOGLE_TRANSLATE_API_KEY) via the readers in
  `ai-providers/src/env.ts`. Never from config
  files, CLI args, or function arguments. Never commit, never log. Route anything
  that could contain a key through `redact()`.
- Errors are structured `ProviderError`s, never raw SDK errors.
- Prompt-injection boundary: system rules are compile-time constants; all untrusted
  input travels only in the user-turn JSON payload. Provider output is schema-bound
  and validated. Placeholder and ICU integrity is enforced after every translation.
  Treat translatable strings as untrusted.
- npm Trusted Publishing via OIDC (no NPM_TOKEN), automatic provenance,
  `repository.url` must match exactly. Least-privilege GITHUB_TOKEN, action pinning
  to commit SHA. The lockfile is committed.

## Shipped scope (deliberately lean)

- The format adapters and the providers, orchestrated by core + sdk + cli, with studio
  as the optional local dashboard.
- Read the shipped surface from the code rather than from a list in a guidance file,
  this one included: the formats are the adapters `createDefaultRegistry` registers in
  `@verbatra/format-adapters`, the providers are the factory table in
  `packages/sdk/src/config/provider-config.ts`, and the CLI commands are the
  `.command(...)` registrations in `packages/cli/src/run.ts`. An enumeration written
  into guidance goes stale the day a command ships; those three files cannot.
- Do not build everything at once. Keep changes within the shipped scope unless the
  brief explicitly expands it, and flag scope expansion to the product owner.
