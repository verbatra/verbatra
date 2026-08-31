# CLAUDE.md

Guidance for Claude when working in the verbatra repository. Follow it exactly; it
overrides general defaults.

## What this is

verbatra is an i18n translation automation tool. Open source, MIT, npm scope
`@verbatra`. Repository: github.com/verbatra/verbatra. It is a pnpm workspaces
monorepo orchestrated by Turborepo, published with Changesets.

## Language and style (hard rules)

- All repository content (code, comments, docs, commit messages) is English. English
  overrides any other default.
- No emojis. No decorative formatting. Natural writing style.
- The em dash character (U+2014) must never appear anywhere in the repository. Use a
  spaced hyphen, a colon, or parentheses instead.

## Toolchain

- Node >=22.14.0, pnpm pinned at 11.6.0 (`packageManager` in the root package.json).
- TypeScript, Biome, Turborepo, Vitest, Changesets, lefthook, commitlint, tsup.
- `.npmrc` sets `verify-deps-before-run=false`; lockfile integrity is enforced
  explicitly by the lefthook `lockfile` hook and by frozen installs in CI. Do not
  remove that setting.

## Commands

Run from the repository root unless noted.

- Install: `pnpm install`
- Build all: `pnpm build` (turbo run build)
- Lint all: `pnpm lint` (turbo run lint)
- Test all: `pnpm test` (turbo run test, Vitest)
- Format: `pnpm format` (biome format --write .)
- Check format and lint without writing: `pnpm check` (biome check .)
- Reproduce the CI merge gate locally: `pnpm verify`. Chains the same nine checks
  the `build-and-test` job runs, in the same order: `check:no-em-dash`, `check`,
  `build`, `check:dts`, `check:studio-bundle`, `turbo run typecheck`,
  `typecheck:configs`, `test`, `test:scripts`. CI keeps them as separate steps so a
  failure names itself; `scripts/verify-script-parity.test.mjs` fails if the two
  definitions drift apart.
- Add a changeset: `pnpm changeset`
- Publish: `pnpm release` (changeset publish; normally run by CI)

Per package (run inside a package directory or with a turbo filter):

- `pnpm typecheck` runs the package tsc check. Most packages have it (config does
  not).
- `pnpm test:watch` runs Vitest in watch mode (most packages have it).
- Filter a single package from the root, for example:
  `pnpm turbo run test --filter=@verbatra/core`.

Turbo task graph: build, lint, and test all depend on `^build`. Test outputs
`coverage/**`; build outputs `dist/**`.

## Linting and type checking

- Biome (config in `packages/config/biome.json`, extended by the root `biome.json`)
  handles formatting and most linting. `noExplicitAny` is an error; no `any`.
- There is no ESLint config in the repo today. Type safety is enforced by the
  per-package `typecheck` (tsc) scripts. If type-aware lint rules are added later,
  wire them through `@verbatra/config`, not ad hoc per package.

## Packages

Published (public): `@verbatra/sdk`, `@verbatra/cli`, and `@verbatra/studio`.
`@verbatra/cli` and `@verbatra/sdk` are version-locked together (Changesets
`fixed`); `@verbatra/studio` versions independently, since it consumes the sdk
contract but ships its own dashboard surface with no 1:1 coupling to it.
Everything else is private or internal and must not be published by accident.

- `@verbatra/config` (private): shared build, TS, and lint config (tsconfig base,
  Biome config, tsup preset). New publishable packages extend this rather than
  redefining build or lint settings.
- `@verbatra/core` (private): pure domain center (model, diffing, hashing, placeholder
  integrity, validation). No I/O, no network, no file system. Depends only on zod.
- `@verbatra/format-adapters` (private): file to neutral-IR adapters for i18n
  formats. Built on two shared factories, `createTreeFileAdapter` (nested-tree
  formats, with `createJsonFileAdapter` as the JSON specialization) and
  `createFlatFileAdapter` (flat key/value formats), registered via
  `createDefaultRegistry`. Adapters: i18next, vue-i18n, next-intl, ngx-translate,
  XLIFF, YAML, Flutter ARB, and Java/Spring properties.
- `@verbatra/ai-providers` (private): translation provider strategies behind one
  interface. Six providers ship today: OpenAI, Anthropic, Gemini (@google/genai),
  DeepL, Google Cloud Translation (Basic, v2), and openai-compatible (a local or
  self-hosted OpenAI-compatible server). The four LLM providers run through the
  shared `runLlmTranslation` layer with one canonical zod schema. DeepL and Google
  Cloud Translation are MT APIs and implement `translateBatch` directly. All sit
  behind one `TranslationProvider` interface. The SDK constructs
  the configured provider through the id-to-factory table in
  `packages/sdk/src/config/provider-config.ts` (`buildProvider`), wrapped by
  `selectProvider`. `ProviderRegistry` is exported from the package but is not on
  that path today; keep it, do not treat it as the resolution mechanism.
- `@verbatra/exchange` (private): translator interchange. Builds and reads styled
  Excel workbooks over a neutral, format-agnostic row model.
- `@verbatra/studio` (public): local dashboard, a prebuilt single-page app served
  over a verbatra project. Local editing is always on; provider-spending actions
  (retranslate, translate pending) are gated behind the `--allow-spend` flag.
  Depends on `@verbatra/sdk`; reached only through the CLI `studio` command via a
  dynamic import, so its absence never breaks the rest of the CLI.
- `@verbatra/sdk` (public): central orchestration API. One-shot `translate()`,
  long-running `watch()`, read-only `check()` and `diff()` (per-locale drift over the
  core `diffResources`, no provider call), `exportWorkbook()` and `importWorkbook()`
  for the Excel handoff, and config loading.
- `@verbatra/cli` (public): the `verbatra` binary (bin maps `verbatra` to
  `dist/index.js`). Thin wrapper over the SDK. Commands: `init`, `translate`, `watch`,
  `check`, `diff`, `export`, `import`, `doctor`, `studio`. Deps: `@verbatra/sdk`,
  commander, zod.
- `apps/docs` (`@verbatra/docs`, private): Fumadocs (Next.js) documentation site.
  Scripts: dev, build, start, typecheck, i18n.

The composite GitHub Action that runs the CLI in CI is no longer part of this
monorepo. It lives in its own repository, github.com/verbatra/action,
and is consumed via `uses:`. Do not add it back here.

## Architecture rules (binding)

- SDK-first: business logic lives in `@verbatra/sdk` and below. `cli` stays thin.
  Do not push logic into the wrappers.
- Acyclic dependency direction:
  config <- core <- format-adapters / ai-providers / exchange <- sdk <- cli /
  framework-adapters. Never import against the arrow. Never create a cycle.
- Keep `@verbatra/core` pure: no I/O, no network, no file system.
- Reuse the provider factory table and the shared adapter factories
  (`createTreeFileAdapter` or `createFlatFileAdapter`). Do not reimplement provider
  plumbing or adapter read, write, and detection logic. When adding a format, build
  on the matching factory and register it.
- zod at boundaries only (config, CLI args, action inputs, provider responses). Keep
  it out of hot paths.

## Code principles

- Strict TypeScript: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes,
  verbatimModuleSyntax, isolatedModules, NodeNext. No `any`. Cognitive complexity
  capped at 15.
- DRY, KISS, SOLID. Clear, descriptive names. Small functions and files.
- Tests with Vitest, co-located as `*.test.ts`. CI enforces 90% coverage on lines,
  functions, statements, and branches.
- Conventional Commits, enforced by commitlint via the lefthook `commit-msg` hook.
  Example: `feat(ai-providers): add Gemini provider`.
- Any publishable `src` change ships a changeset with the right bump level.
  `@verbatra/studio` is now published like sdk and cli; a `src` change there needs a
  changeset too, even though it used to be private and changeset-exempt.

## Comments and documentation

- No prose comments and no JSDoc on internal code. Names and structure carry the
  intent. When reasoning has to be preserved, promote it to a test that fails if the
  behavior regresses, not to a comment.
- JSDoc belongs only on the published API surface, written to the standard of the
  OpenAI SDK, NestJS, or Node.js: what it does, when to use it, what each parameter
  means, every thrown error with the condition that triggers it, and a runnable
  `@example` on genuine entry points.
- Published is not the opposite of private. The test is whether the declaration
  appears in the package's built `.d.ts`. tsup `dts.resolve` inlines types from the
  private workspace packages into `packages/sdk/dist/index.d.ts`, so a declaration in
  `@verbatra/core` can be published API. Check the built output, not the package's
  `private` flag. This distinction is what previous sweeps lost.
- House style: type-free `@param name - Description.`, type-free `@returns`,
  ``@throws {@link SdkError} `CODE`: condition.`` with one line per code, `{@link}`
  for cross-references, and `@example` used sparingly on entry points. Never
  `@remarks`, `@see`, `@defaultValue`, `@deprecated`, `@internal`, `@public`,
  `@typeParam`, or `@param {Type}`.
- Derive every `@throws` from the actual throw sites; never copy one from existing
  docs. A documented code that is never thrown is worse than a missing one: it tells
  a consumer to write a catch branch that can never fire.
- A `{@link}` target must be declared in the built `.d.ts`, whether exported from it
  or only inlined into it. TypeScript resolves a link by in-file name lookup, so a
  declared-but-not-exported symbol still resolves and still gives editor hover. A
  link to a symbol that appears nowhere in the built declarations renders silently as
  plain text; use inline code for those instead.
- Some comments are functional and must survive any removal pass: coverage
  directives (`/* v8 ignore ... */`), whose loss drops coverage against the 90% gate;
  `biome-ignore`, whose reason text after the colon is mandatory syntax in Biome 2.x
  and cannot be emptied; `@ts-expect-error`, where removing a still-needed one is
  itself a TS2578 error; the `// @vitest-environment jsdom` pragmas, without which
  the file runs in node and every DOM test throws; shebangs; the type-bearing JSDoc
  in the two `checkJs` files, `packages/config/tsup.base.mjs` and `vitest.base.mjs`,
  where the JSDoc is the type annotation; SHA-pin version comments (`# v7.0.1`) in
  workflow files, which Dependabot parses to update the pin; JSON that only looks
  like a comment, namely Turborepo's `"extends": ["//"]` and the real `"//"` key in
  `tsconfig.configs.json`; and `/// <reference types=... />` in generated files such
  as `apps/docs/next-env.d.ts`.
- The rule governs code. CI and supply-chain rationale in workflow and config files
  (`.github/workflows`, `dependabot.yml`, `pnpm-workspace.yaml`, `lefthook.yml`) is
  exempt where no test covers the behavior it describes, for example the `head_sha`
  trust-boundary argument in `release.yml`, the Scorecard two-job-split requirement,
  and per-override CVE rationales. Promote such rationale to an executable assertion
  where one is possible; keep the prose where it is not.

## Security

- API keys come only from environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY,
  GEMINI_API_KEY, DEEPL_API_KEY, GOOGLE_TRANSLATE_API_KEY), read through
  `packages/ai-providers/src/env.ts`. Never from config files, CLI args, or function
  arguments. Never log or commit a key. Error messages name the variable but never
  include a key value.
- Errors are structured `ProviderError`s, never raw SDK errors.
- Prompt-injection boundary: system rules are compile-time constants; untrusted input
  travels only in the user-turn JSON payload; provider output is schema-bound and
  validated; placeholder and ICU integrity is enforced after every translation. Treat
  translatable strings as untrusted.
- Publishing: npm Trusted Publishing via OIDC (no NPM_TOKEN), automatic provenance,
  `repository.url` matching exactly, least-privilege GITHUB_TOKEN, GitHub Actions
  pinned to commit SHAs, committed lockfile.

## Git hooks (lefthook)

- pre-commit: Biome check on staged JS/TS/JSON, and a lockfile-sync check when a
  package.json or lockfile changed.
- commit-msg: commitlint (Conventional Commits).
  If a hook fails, fix the cause (run `pnpm check` or `pnpm format`, or
  `pnpm install` to sync the lockfile) and re-stage. Do not bypass hooks.

## The verbatra team agents

`.claude/agents/` holds ten role agents (product owner, software architect,
developer, code reviewer, QA, security reviewer, release manager, docs writer, docs
designer, devops) that mirror the Cowork delivery team. Dispatch them for the matching
stage of work. They follow the rules in this file.

The team's runtime workspace lives under `.verbatra/` (gitignored, local to the
clone): specs in `.verbatra/specs/`, the audit log in `.verbatra/log/`, architecture
decision records in `.verbatra/adr/`, and each agent's persistent memory in
`.verbatra/agent-memory/<role>/`. The agent definitions in `.claude/` are tracked; the
`.verbatra/` workspace is not.
