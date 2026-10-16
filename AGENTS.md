# AGENTS.md

Guide for coding agents working in this repository. Verbatra is an open source (MIT) i18n
translation tool: a CLI, an SDK, a local Studio dashboard and a stdio MCP server, published under
the npm scope `@verbatra`. The binding project rules are in [CLAUDE.md](CLAUDE.md) and
[.claude/rules/](.claude/rules/); this file points to them and does not repeat them.

## Setup

- Node.js `^22.18.0 || >=24`, pnpm `11.6.0` (pinned in `packageManager`; run `corepack enable`).
- `pnpm install` from the repository root. It also installs the Git hooks (lefthook).

## Commands

Run from the repository root. The scripts are defined in the root `package.json`.

- `pnpm verify`: the full CI merge gate (em dash check, Biome, build, build output checks,
  typecheck, tests, script tests). Run it before you call a change done.
- `pnpm check` / `pnpm format`: Biome lint and format check / apply formatting.
- `pnpm build`, `pnpm test`: all packages through Turborepo.
- `pnpm turbo run test --filter=@verbatra/<package>`: one package's tests.
- `pnpm knip`: unused files, exports and dependencies.
- `pnpm dev:docs`: the docs site (`apps/docs`) locally.
- `pnpm changeset`: add a changeset for a user-observable change to a published package.

## Layout

- `packages/core`: pure domain model, no I/O.
- `packages/format-adapters`, `packages/ai-providers`, `packages/exchange`, `packages/extract`:
  file formats, translation providers, Excel and TMX interchange, source-code extraction.
- `packages/sdk`: the orchestration API; business logic lives here and below.
- `packages/cli`, `packages/studio`, `packages/mcp`: thin surfaces over the SDK.
- `packages/config`: shared TypeScript, Biome, tsup and Vitest presets.
- `apps/docs`: the documentation site and landing page (Next.js and Fumadocs).

Dependencies flow one way; [.claude/rules/architecture.md](.claude/rules/architecture.md) has the
graph and the extension rules.

## Where things are registered

Look these up in code instead of trusting a list:

- Commands: the `.command(...)` registrations in `packages/cli/src/run.ts`.
- Formats: `createDefaultRegistry` in `packages/format-adapters/src/default-registry.ts`.
- Providers: `providerFactories` in `packages/sdk/src/config/provider-config.ts`.

## Rules

- [.claude/rules/architecture.md](.claude/rules/architecture.md): dependency direction, adding a
  provider or a format adapter.
- [.claude/rules/code-organization.md](.claude/rules/code-organization.md): one barrel per
  package, no path aliases, where a type lives.
- [.claude/rules/design-patterns.md](.claude/rules/design-patterns.md): the Strategy and Factory
  shapes to extend.
- [.claude/rules/testing.md](.claude/rules/testing.md): Vitest conventions, the 90 percent
  coverage gate, the `e2e/` suite.
- [.claude/rules/docs.md](.claude/rules/docs.md): the docs site and its translations.
- [.claude/rules/git-conventions.md](.claude/rules/git-conventions.md): commits, hooks, branches
  and changesets.

In short: TypeScript strict, no `any`, English only, no emoji, never the em dash character, no
prose comments on internal code.

## Docs and translations

`apps/docs` has two kinds of translated content. UI strings live in `apps/docs/messages/*.json`
and are translated with Verbatra itself (`pnpm i18n` in `apps/docs`). MDX pages under
`apps/docs/content/docs` are translated by hand into `de`, `es` and `fr` in the same change as the
English page. Details are in [.claude/rules/docs.md](.claude/rules/docs.md).

## Do not

- Commit secrets or `.env` files, or read API keys from anywhere but environment variables.
- Commit generated output (`dist/`, `coverage/`, `.turbo/`, `.next/`) or edit
  `pnpm-lock.yaml` by hand.
- Bypass the Git hooks with `--no-verify`.
- Put logic into `cli`, `studio` or `mcp` that belongs in the SDK.

## Commits

Conventional Commits (`type(scope): subject`, lowercase subject, no trailing period), enforced
by commitlint in the `commit-msg` hook. Branch names follow `<type>/<kebab-case>`. The rules,
including when a change needs a changeset, are in
[.claude/rules/git-conventions.md](.claude/rules/git-conventions.md) and
[CONTRIBUTING.md](CONTRIBUTING.md).
