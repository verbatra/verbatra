# CLAUDE.md

Guidance for Claude when working in the verbatra repository. Follow it exactly; it
overrides general defaults.

## What this is

verbatra is an i18n translation automation tool: open source, MIT license, npm scope
`@verbatra`. A pnpm workspaces monorepo (`packages/*`, `apps/*`) built with
TypeScript, orchestrated by Turborepo, published with Changesets. Node >=22.14.0,
pnpm pinned at 11.6.0.

## Commands

Run from the repository root unless noted. `pnpm verify` reproduces the CI merge
gate; the exact check sequence it chains is defined in the root `package.json`
`scripts` block, not restated here. Per-package `pnpm typecheck` and `pnpm
test:watch` exist inside most package directories; filter a single package from the
root with `pnpm turbo run <task> --filter=<package>`.

## Code style

TypeScript strict mode plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, `isolatedModules`, `NodeNext` (base config:
`packages/config/tsconfig.base.json`). No `any`. Cognitive complexity capped at 15.
Biome (`packages/config/biome.json`, extended by root `biome.json`) enforces
formatting and most linting; do not restate its rules here, just run `pnpm check` /
`pnpm format`. Vitest coverage gate is 90 percent on lines, functions, statements,
and branches (`packages/config/vitest.base.mjs`).

Hard rules a linter cannot enforce:

- All repository content (code, comments, docs, commit messages) is English.
- No emojis, no decorative formatting.
- The em dash character (U+2014) must never appear anywhere in the repository. Use a
  spaced hyphen, a colon, or parentheses instead. Enforced by the `check:no-em-dash`
  script and hook, but write clean in the first place.
- No prose comments and no JSDoc on internal code: names and structure carry intent.
  When reasoning must be preserved, promote it to a test that fails if the behavior
  regresses, not a comment.
- JSDoc belongs only on the published API surface. The test is whether the
  declaration appears in the package's built `.d.ts`, not whether the package itself
  is marked private: tsup's `dts.resolve` inlines types from private workspace
  packages (e.g. `@verbatra/core`) into `packages/sdk/dist/index.d.ts`, so a
  declaration there can be published API. Check the built output.
- A short list of comments are functional, not prose, and must survive any cleanup
  pass regardless: coverage directives, `biome-ignore` reason text, `@ts-expect-error`,
  `@vitest-environment jsdom` pragmas, shebangs, SHA-pin version comments in workflow
  files, and structural JSON keys such as Turborepo's `"extends": ["//"]`.
- GitHub Actions workflow files take no new prose or rationale comments, even for
  supply-chain reasoning; put that in the commit message body instead. Functional
  comments (SHA-pin comments, the items above) are still fine there.

## Architecture and repo map

Packages on `main`: `@verbatra/core` (private, pure domain model, no I/O), `@verbatra/format-adapters`
(private, file to neutral-IR adapters), `@verbatra/ai-providers` (private, translation
provider strategies), `@verbatra/exchange` (private, Excel workbook interchange),
`@verbatra/config` (private, shared build/TS/lint config), `@verbatra/sdk` (public,
central orchestration API), `@verbatra/cli` (public, the `verbatra` binary),
`@verbatra/studio` (public, local dashboard), `@verbatra/mcp` (public, stdio MCP
server exposing translation status, glossary, and editing tools). `apps/docs`
(private) is the Fumadocs documentation site. `@verbatra/cli` and `@verbatra/sdk`
version together (Changesets fixed group); `@verbatra/studio` and `@verbatra/mcp`
each version independently.

Binding dependency-direction and extension-pattern rules, with exact file pointers,
live in `.claude/rules/architecture.md`. Read it before adding a package, a provider,
or a format adapter. In short: business logic lives in the SDK and below, `cli` stays
thin, dependencies flow one way (config -> core -> format-adapters / ai-providers /
exchange -> sdk -> cli), and new providers or formats extend the existing factory
tables rather than reimplementing plumbing.

For reusable design patterns already established in this codebase (Strategy,
Factory, Adapter) and where to look before introducing a new one, see
`.claude/rules/design-patterns.md`.

## Testing

`.claude/rules/testing.md` is the source of truth for Vitest conventions, the
coverage gate, what the root-level `e2e/` suite already covers for the CLI binary,
and the current gap in Studio browser test coverage. Skim it before writing or
extending any test.

## Workflow rules

- Never push logic into `cli` or `studio` that belongs in the SDK.
- Reuse the shared adapter factories and the provider factory table; do not
  reimplement adapter or provider plumbing.
- zod validates at boundaries only (config, CLI args, provider responses), not in
  hot paths.
- API keys come only from environment variables (`ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `GEMINI_API_KEY`, `DEEPL_API_KEY`, `GOOGLE_TRANSLATE_API_KEY`),
  read through `packages/ai-providers/src/env.ts`. Never from config files, CLI args,
  or function arguments. Never log or commit a key; error messages name the variable
  but never include a key value.
- Provider errors are structured `ProviderError`s, never raw SDK errors.
- Prompt-injection boundary: system rules are compile-time constants; untrusted input
  travels only in the user-turn JSON payload; provider output is schema-bound and
  validated; placeholder and ICU integrity is enforced after every translation. Treat
  translatable strings as untrusted.
- Publishing is npm Trusted Publishing via OIDC (no `NPM_TOKEN`), with automatic
  provenance and a least-privilege `GITHUB_TOKEN`.
- Any publishable `src` change (including `@verbatra/studio` and `@verbatra/mcp`)
  ships a changeset with the correct bump level.

## Git and commits

Conventional Commits format, commitlint rules, pre-commit hooks, branch naming, and
the changeset requirement are all defined in `.claude/rules/git-conventions.md`.
Follow it rather than improvising commit or branch conventions.

## Docs site

`apps/docs` mixes real verbatra-managed UI-string translation with hand-maintained
MDX locale content. How that split works, the source-of-truth files for what has
shipped, and the `<AvailableFrom />` and tone conventions are documented in
`.claude/rules/docs.md`.

## Agents and skills

`.claude/agents/code-reviewer.md` reviews a diff or branch for correctness,
readability, this repo's strictness and lint rules, and pattern reuse; it does not
edit code. Dispatch it after implementation work, before merge.

`.claude/agents/test-runner.md` validates test coverage and suite health across
unit, integration, and CLI e2e; it is also the agent to dispatch for building out
Studio's still-missing Playwright e2e suite.

Skills are installed via the `skills.sh` mechanism (`npx skills@latest add <owner/repo>
--skill <name> -a claude-code -y`, tracked in `skills-lock.json`). See
`.claude/skills/` for the current list rather than assuming one here; it grows over
time.
