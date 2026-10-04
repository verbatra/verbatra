# Testing

## Unit and integration tests (Vitest)

- Co-located as `*.test.ts` beside the source file, per package. The vitest coverage config
  (`packages/config/vitest.base.mjs`, `createVitestConfig`) defaults `testInclude` to
  `["src/**/*.test.ts"]` and `coverageInclude` to `["src/**/*.ts"]`, excluding test files,
  `src/index.ts`, and `src/**/types.ts` from coverage. `createVitestConfig` takes `testInclude`,
  `coverageInclude`, and `coverageExclude` overrides; `@verbatra/studio` uses this to extend
  `testInclude` with `"src/app/**/*.test.tsx"` (`packages/studio/vitest.config.ts`), since its
  React component tests are `.test.tsx`, not `.test.ts`. Check a package's own `vitest.config.ts`
  before assuming the bare default applies.
- CI's coverage gate is 90% on lines, functions, statements, and branches
  (`thresholds: { lines: 90, functions: 90, statements: 90, branches: 90 }` in
  `packages/config/vitest.base.mjs`). This applies per package, not repo-wide.
- Run one package's tests from the repo root with a turbo filter:
  `pnpm turbo run test --filter=@verbatra/core` (substitute the package name). Inside a package
  directory, `pnpm test` runs `vitest run --coverage` once; `pnpm test:watch` runs `vitest` in
  watch mode (most packages have both; check the package's own `package.json` scripts).
- `pnpm test` at the root runs `turbo run test` across every package. `turbo.json` makes `test`
  depend on `^build`, so a package's workspace dependencies are built first.
- Root-level script tests: `pnpm test:scripts` runs `vitest run --dir scripts` against the repo's
  own build/CI helper scripts (for example `scripts/verify-script-parity.test.mjs`, which fails if
  the `pnpm verify` step list and CI's step list drift apart). Not per-package coverage.
- `packages/studio` uses `jsdom` (`@vitest-environment jsdom` pragma where needed) for
  component-level tests; it has no browser-level test today (see the Studio gap below).

## The `e2e/` directory: what already exists

`e2e/` (`e2e/README.md`, `e2e/package.json`) is a Vitest-driven suite, not Playwright, and it is
the end-to-end coverage of the four published packages as a consumer installs them. It sits outside the pnpm workspace on purpose (its own
`e2e/package-lock.json`, consumed by `npm ci`/`npm install`), so the consumer install resolves the
real published tarballs instead of workspace symlinks.

How it works: `e2e/src/global-setup.ts` packs `@verbatra/sdk`, `@verbatra/cli`, `@verbatra/studio`,
and `@verbatra/mcp` (or reuses `VERBATRA_SDK_TARBALL`, `VERBATRA_CLI_TARBALL`,
`VERBATRA_STUDIO_TARBALL`, and `VERBATRA_MCP_TARBALL`, which must be all set or all unset). Each
test builds a temp project, `npm install`s the sdk and cli tarballs plus the studio or mcp one when
it asks for it (`makeConsumer({ withStudio, withMcp })` in `e2e/src/harness.ts`), and drives the
real `verbatra` binary. `e2e/tests/studio.e2e.test.ts` exercises the Studio server over HTTP and
`e2e/tests/mcp.e2e.test.ts` the stdio MCP server; neither opens a browser. This catches packaging,
bundling, and bin regressions unit tests cannot see.

Split into two tiers by determinism, which doubles as the trust boundary for secrets:

- **No-key tier**: every file except `tests/*.live.e2e.test.ts`, run with `npm run test:nokey`
  (`vitest.nokey.config.ts`). Covers packaging smoke, `init` scaffolding, `check`/`diff`/`export`
  across formats, `translate --dry-run`, export-then-import round-trips, the keyless flag surface,
  structured exit-2 boundary errors, and the full `watch` lifecycle including SIGINT handling
  (`e2e/tests/watch-lifecycle.e2e.test.ts` keeps this keyless by giving the run nothing to
  translate). Calls no hosted provider and makes no network request outside 127.0.0.1: two tests
  (`e2e/tests/interrupt-releases-locks.e2e.test.ts` and the held-lock test in
  `e2e/tests/mcp.e2e.test.ts`) point an `openai-compatible` provider at a never-answering loopback
  endpoint (the MCP one through `--allow-spend`, spending nothing), and
  `e2e/tests/watch-lifecycle.e2e.test.ts` names an unreachable `127.0.0.1:1` endpoint it never
  reaches. The 2026-07-28 session test in `e2e/tests/mcp.e2e.test.ts` translates against a
  loopback LibreTranslate stub it serves (`e2e/src/libretranslate-endpoint.ts`), so it too makes
  no network request outside 127.0.0.1. `e2e/tests/human-only.e2e.test.ts` goes further and
  preloads a module that throws on any socket, proving a `provider: none` run makes no network
  call at all. **This is the required release
  gate**: it runs as the `e2e` job in `.github/workflows/ci.yml`, and `release.yml` only publishes
  when the CI workflow's conclusion is success.
- **Live tier**: `tests/translate.live.e2e.test.ts` and `tests/watch.live.e2e.test.ts`, run with
  `npm test` (which runs both tiers), plus `tests/libretranslate.live.e2e.test.ts`, which skips
  unless `LIBRETRANSLATE_URL` points at a LibreTranslate server you started yourself (no workflow
  starts one; see `e2e/README.md`). Drives real `translate`/`watch` against a live provider
  (default `gemini`, controlled by `E2E_PROVIDER` and the matching API key env var). Runs nightly,
  on push to `main`, and on manual dispatch via `.github/workflows/e2e-live.yml`, never on a pull
  request, and is advisory: it never gates a publish, since its outcome depends on a third party's
  rate limiter.

**CLI e2e is not a gap.** It exists, is deterministic-gated in CI, and is documented in
`e2e/README.md`, which is the primary source if extending it.

## Gap: Studio has no browser-level e2e coverage today

`@verbatra/studio` is a local web dashboard (a prebuilt SPA served over a verbatra project;
`packages/studio/package.json`) with unit/component tests under `packages/studio/src/` (jsdom-based)
but **no test that drives it in a real browser**. Concretely, as of this writing:

- `playwright` (`pnpm-workspace.yaml` catalog, pinned `1.63.0`) is a devDependency only of
  `apps/docs` (`apps/docs/package.json`), used exclusively by the one-off screenshot script
  `apps/docs/scripts/capture-studio.mjs` (see `CONTRIBUTING.md` "Refreshing the Studio
  screenshots"). It is not wired up as a test runner anywhere.
- There is no `playwright.config.ts` in the repo.
- `pnpm-workspace.yaml`'s `allowBuilds` section explicitly sets `playwright: false`, with a comment
  explaining that Playwright's postinstall would otherwise download a browser binary (hundreds of
  MB) on every `pnpm install` and every CI job. This keeps the browser download opt-in: a
  maintainer runs `pnpm --filter @verbatra/docs exec playwright install chromium` by hand before
  using it. **Any new Playwright test suite needs this addressed** before it can run unattended in
  CI (either scoping a build override to the new package, or accepting the same manual-install
  convention and adding an explicit `playwright install` step to the relevant CI job).

When actually building Studio's browser e2e suite, use the `playwright-cli` and
`playwright-best-practices` skills in `.claude/skills/` for the mechanics (config, fixtures,
locators, CI wiring, flake avoidance) rather than reinventing them here. This rules file is a
map of the gap and the constraint that blocks it in CI, not a scaffold: designing and building the
actual suite (deciding what to boot the dashboard against, whether to reuse the docs' `capture-studio.mjs`
fixture/harness pattern for booting the CLI + Studio, and how CI installs the browser binary) is
separate, larger work.

**The `design-reviewer` agent does not close this gap.** `.claude/agents/design-reviewer.md`
drives a real browser over `apps/docs` and Studio through the Playwright MCP server to review
rendered UI against the `docs-ui` and `studio-ui` token skills. That is an interactive,
agent-dispatched review producing findings and screenshots; it asserts nothing, it is not a
suite, it does not run in CI, and it gates no merge. It also uses the MCP server's own browser,
so it sidesteps the `allowBuilds` constraint above rather than resolving it. A committed
Playwright suite for `@verbatra/studio` is still missing, and the two constraints on building
one (no `playwright.config.ts`, `playwright: false` in `allowBuilds`) are unchanged. Dispatch
`design-reviewer` for a visual verdict on a UI change; dispatch `test-runner` when the job is
building the suite that is still absent.
