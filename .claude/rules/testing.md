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
the CLI's end-to-end coverage. It sits outside the pnpm workspace on purpose (its own
`e2e/package-lock.json`, consumed by `npm ci`/`npm install`), so the consumer install resolves the
real published tarballs instead of workspace symlinks.

How it works: `e2e/src/global-setup.ts` packs `@verbatra/sdk` and `@verbatra/cli` (or reuses
`VERBATRA_SDK_TARBALL` / `VERBATRA_CLI_TARBALL` if both are set), each test builds a temp project,
`npm install`s both tarballs, and drives the real `verbatra` binary through `e2e/src/harness.ts`.
This catches packaging, bundling, and bin regressions unit tests cannot see.

Split into two tiers by determinism, which doubles as the trust boundary for secrets:

- **No-key tier**: every file except `tests/*.live.e2e.test.ts`, run with `npm run test:nokey`
  (`vitest.nokey.config.ts`). Covers packaging smoke, `init` scaffolding, `check`/`diff`/`export`
  across formats, `translate --dry-run`, export-then-import round-trips, the keyless flag surface,
  structured exit-2 boundary errors, and the full `watch` lifecycle including SIGINT handling
  (`e2e/tests/watch-lifecycle.e2e.test.ts` keeps this keyless by giving the run nothing to
  translate). Makes no provider call, no network request. **This is the required release gate**:
  it runs as the `e2e` job in `.github/workflows/ci.yml`, and `release.yml` only publishes when the
  CI workflow's conclusion is success.
- **Live tier**: `tests/translate.live.e2e.test.ts` and `tests/watch.live.e2e.test.ts`, run with
  `npm test` (which runs both tiers). Drives real `translate`/`watch` against a live provider
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

- `playwright` (`pnpm-workspace.yaml` catalog, pinned `1.62.1`) is a devDependency only of
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
