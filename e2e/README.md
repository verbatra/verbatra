# @verbatra/e2e

End-to-end tests that install the published `@verbatra/cli` and `@verbatra/sdk`
tarballs into a throwaway project and drive the real `verbatra` binary, the way a
user would. This catches packaging, bundling, and bin regressions that the per-package
unit tests cannot see.

This directory is deliberately outside the pnpm workspace so the consumer install
resolves the real tarballs instead of workspace symlinks.

## How it works

`src/global-setup.ts` packs `@verbatra/sdk` and `@verbatra/cli` once (or reuses the
paths in `VERBATRA_SDK_TARBALL` / `VERBATRA_CLI_TARBALL`). Each test builds a temp
project, `npm install`s both tarballs, and runs the binary via `src/harness.ts`.

## Tiers

The suite is split by determinism, which is also the trust boundary: a provider secret never
reaches code a pull request can modify, and only the deterministic half is allowed to gate a
release.

A live-tier file is named `*.live.e2e.test.ts`. That name is the whole split: `npm run test:nokey`
runs everything else, via `vitest.nokey.config.ts`. Nothing keeps a list of files to run, so a new
deterministic test joins the required gate automatically.

- **No-key tier** (everything except `tests/*.live.e2e.test.ts`, run with `npm run test:nokey`):
  packaging smoke, `init` scaffolding, `check` across i18next, YAML, Flutter ARB, and `.properties`
  projects, `diff` and `export` on the i18next project, `translate --dry-run`, `export` then
  `import` round-trips for i18next and `.properties` (a workbook filled in code the way a
  translator would) plus an import of the untouched, structure-locked bytes `export` wrote, the
  keyless flag surface (`--dry-run --concurrency 2` with progress on stderr and a clean stdout
  summary, `--no-cache`, and the `--concurrency` versus `maxTokens` refusal exiting 2 on
  `CONCURRENCY_BUDGET_CONFLICT` before any provider is constructed), structured exit-2 boundary
  errors (missing config, invalid config values, an invalid `--debounce`, an unreadable `.env`),
  the `watch` SIGINT contract, and the full `watch` lifecycle: a successful startup run, a second
  run triggered by a source change, and a clean exit 0 on a single interrupt
  (`tests/watch-lifecycle.e2e.test.ts`, which stays keyless by giving the run nothing to translate,
  so no provider is ever called). It makes no provider call and no network request, so it is
  deterministic and free.

  **This tier is the required release gate.** It runs as the `e2e` job in
  `.github/workflows/ci.yml`, feeds the `Build and test gate` job, and `release.yml` publishes only
  when the CI workflow concludes successfully. A broken CLI cannot reach npm.

- **Live tier** (`tests/translate.live.e2e.test.ts`, `tests/watch.live.e2e.test.ts`; `npm test`
  runs it alongside the no-key tier): real `translate` and `watch` against a live provider.
  `translate` fills a missing key and leaves the project in sync; `watch` translates on startup,
  again on a source change, and stops on interrupt. It needs `E2E_PROVIDER` (default `gemini`) and
  the matching API key, and skips otherwise. `.github/workflows/e2e-live.yml` runs it on a nightly
  schedule, on push to `main`, and on manual dispatch only, never on a pull request, with the key
  scoped to the `live-e2e` GitHub Environment.

  **This tier is advisory and never gates a publish**, because its result depends on a third
  party's rate limiter. That is not licence to ignore it: the live `watch` test reads each run's
  `--json` record, so a key the SDK withheld after a `RATE_LIMITED` sub-batch failure is retried
  with a backoff and, if the throttling persists, reported as a skipped test. Every other cause
  still fails. A red run here therefore means the CLI is genuinely broken against a real provider.

## Running locally

```sh
# assumes `pnpm install` has been run at the repo root
cd e2e
npm install

# no-key tier (no secrets needed)
npm run test:nokey

# full suite, adding the live tier
E2E_PROVIDER=gemini GEMINI_API_KEY=... npm test
```

Without `VERBATRA_SDK_TARBALL` / `VERBATRA_CLI_TARBALL`, global setup builds `@verbatra/sdk`,
`@verbatra/cli`, and their workspace dependencies, then packs the tarballs itself via pnpm, so a
stale local `dist/` is never packed by accident. To reuse tarballs you packed yourself (the CI
path), set both variables; setting only one fails setup. The variables must hold concrete paths
(the harness does not expand globs), so resolve them with `$(ls ...)`:

```sh
# from the repo root
pnpm build
mkdir -p /tmp/packs
pnpm --filter @verbatra/sdk pack --pack-destination /tmp/packs
pnpm --filter @verbatra/cli pack --pack-destination /tmp/packs

cd e2e
VERBATRA_SDK_TARBALL=$(ls /tmp/packs/verbatra-sdk-*.tgz) \
VERBATRA_CLI_TARBALL=$(ls /tmp/packs/verbatra-cli-*.tgz) \
  npm run test:nokey
```

## Choosing the live provider

`E2E_PROVIDER` is one of `gemini`, `anthropic`, `openai`, `deepl`, `google-translate`.
Gemini is the default because it has a free API tier, which keeps the nightly smoke
translation at no cost. The matching key (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `DEEPL_API_KEY`, `GOOGLE_TRANSLATE_API_KEY`) must be in the
environment, otherwise the live tier skips.
