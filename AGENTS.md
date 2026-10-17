# AGENTS.md

Guide for coding agents working in this repository. Verbatra is an open source (MIT) i18n
translation tool: a CLI, an SDK, a local Studio dashboard and a stdio MCP server, published under
the npm scope `@verbatra`. The binding rules are in [CLAUDE.md](CLAUDE.md) and
[.claude/rules/](.claude/rules/); this file points to them and does not repeat them.

## Setup and commands

- Node.js `^22.18.0 || >=24`, pnpm `11.6.0` (pinned in `packageManager`; run `corepack enable`).
- `pnpm install` from the repository root; it also installs the Git hooks (lefthook).
- Every script is defined in the root `package.json`. `pnpm verify` is the CI merge gate; read
  its `scripts` entry for the checks it chains, and run it before you call a change done.
- One package's tests: `pnpm turbo run test --filter=@verbatra/<package>`.

## Layout

- `packages/core`: pure domain model, no I/O.
- `packages/format-adapters`, `packages/ai-providers`, `packages/exchange`, `packages/extract`:
  file formats, translation providers, Excel and TMX interchange, source-code extraction.
- `packages/sdk`: the orchestration API; business logic lives here and below.
- `packages/cli`, `packages/studio`, `packages/mcp`: thin surfaces over the SDK.
- `packages/config`: shared TypeScript, Biome, tsup and Vitest presets.
- `apps/docs`: the documentation site and landing page (Next.js and Fumadocs).

Commands, formats and providers are registered in code (`packages/cli/src/run.ts`,
`packages/format-adapters/src/default-registry.ts`, `packages/sdk/src/config/provider-config.ts`);
look them up there instead of trusting a list. Dependencies flow one way:
[.claude/rules/architecture.md](.claude/rules/architecture.md). Testing:
[.claude/rules/testing.md](.claude/rules/testing.md). Docs and their translations:
[.claude/rules/docs.md](.claude/rules/docs.md).

In short: TypeScript strict, no `any`, English only, no emoji, never the em dash character, no
prose comments on internal code.

## Changesets and commits

Conventional Commits, enforced by commitlint in the `commit-msg` hook; branches are
`<type>/<kebab-case>`. Whether a change needs a changeset, and where it goes, follows
[.claude/rules/git-conventions.md](.claude/rules/git-conventions.md): a change to a private package
the SDK bundles names `@verbatra/sdk`, not the private package, and during the 0.12.0 cycle a
change extends the matching release theme file in `.changeset/` instead of adding one.

## Do not

- Read an API key from anywhere but environment variables, or log, print or commit a key value.
- Commit secrets, `.env` files, or generated and local output: `dist/`, `coverage/`, `.turbo/`,
  `.next/`, `.source/`, `.verbatra/`, `node_modules/`.
- Hand-edit generated files (`apps/docs/lib/*.generated.json`, `pnpm-lock.yaml`); rerun the
  script that writes them.
- Add prose or rationale comments to GitHub Actions workflow files; put the reasoning in the
  commit message.
- Bypass the Git hooks with `--no-verify`.
- Put logic into `cli`, `studio` or `mcp` that belongs in the SDK.
