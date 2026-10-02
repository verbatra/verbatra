# @verbatra/e2e

End-to-end tests that install the packed `@verbatra/sdk`, `@verbatra/cli`,
`@verbatra/studio`, and `@verbatra/mcp` tarballs into a throwaway project and drive
the real `verbatra` binary, the way a user would. This catches packaging, bundling, and bin regressions that the per-package
unit tests cannot see.

This directory is deliberately outside the pnpm workspace so the consumer install
resolves the real tarballs instead of workspace symlinks.

## How it works

`src/global-setup.ts` packs `@verbatra/sdk`, `@verbatra/cli`, `@verbatra/studio`, and
`@verbatra/mcp` once (or reuses the paths in `VERBATRA_SDK_TARBALL` / `VERBATRA_CLI_TARBALL` /
`VERBATRA_STUDIO_TARBALL` / `VERBATRA_MCP_TARBALL`).
Each test builds a temp project, `npm install`s the sdk and cli tarballs, plus the studio or mcp
tarball when it asks for one (`makeConsumer({ withStudio, withMcp })`), and runs the binary via
`src/harness.ts`.

## Tiers

The suite is split by determinism, which is also the trust boundary: a provider secret never
reaches code a pull request can modify, and only the deterministic half is allowed to gate a
release.

A live-tier file is named `*.live.e2e.test.ts`. That name is the whole split: `npm run test:nokey`
runs everything else, via `vitest.nokey.config.ts`. Nothing keeps a list of files to run, so a new
deterministic test joins the required gate automatically.

- **No-key tier** (everything except `tests/*.live.e2e.test.ts`, run with `npm run test:nokey`):
  packaging smoke, a `.cjs` config that `require`s `defineConfig` from `@verbatra/cli` or
  `@verbatra/sdk`, and the `causeCode` and hint of a `.cjs` or `.ts` config whose import cannot be
  resolved (`tests/cjs-config.e2e.test.ts`), `init` scaffolding, `check` across i18next, YAML, Flutter ARB, and `.properties`
  projects, `check` on a gettext project whose `posix` locale directories use the gettext names
  `sr@latin`, `es_419` and `zh_TW` (`tests/gettext-posix-locales.e2e.test.ts`), `diff` and `export` on the i18next project, `translate --dry-run`, `translate --estimate` with every provider key blanked
  (`tests/estimate.e2e.test.ts`: the quantity line, the explicit missing-rate line, a priced run
  once the config carries `rates`, the structured JSON fields, and that no locale, lock, or cache
  file is written), `export` then
  `import` round-trips for i18next and `.properties` (a workbook filled in code the way a
  translator would) plus an import of the untouched, structure-locked bytes `export` wrote, the
  keyless flag surface (`--dry-run --concurrency 2` with progress on stderr and a clean stdout
  summary, `--no-cache`, and the `--concurrency` versus `maxTokens` refusal exiting 2 on
  `CONCURRENCY_BUDGET_CONFLICT` before any provider is constructed), structured exit-2 boundary
  errors (missing config, invalid config values, an invalid `--debounce`, an unreadable `.env`),
  the `watch` SIGINT contract, and the full `watch` lifecycle: a successful startup run, a second
  run triggered by a source change, and a clean exit 0 on a single interrupt
  (`tests/watch-lifecycle.e2e.test.ts`, which stays keyless by giving the run nothing to translate,
  so no provider is ever called), and the human-only workflow under `provider: { id: "none" }`
  (`tests/human-only.e2e.test.ts`: `init --provider none`, `doctor`, `translate` exiting 3 with
  every key left for a human, then `export`, `import`, and `check` green, all under a preload that
  makes any network call fatal), and protection of human work
  (`tests/protect-human.e2e.test.ts`: an imported value whose source changed is listed as
  protected by `translate --dry-run`, not as to translate, is counted by `check` and `diff`, and is
  planned for translation again only with `--include-human`), and the persisted review workflow
  (`tests/review-workflow.e2e.test.ts`: agent-written values seeded through the Studio HTTP API,
  two approved and one rejected there, then `check --require-reviewed` reporting the same
  unreviewed key and exit 1 in the project and in a fresh copy without `.verbatra-local`, as a
  teammate would see it), and `init` for agents
  (`tests/init-for-agents.e2e.test.ts`: a flags-only `init --json` whose config `doctor` passes
  with no hand edit, detection of an existing YAML layout, a `CONFIG_EXISTS` refusal on a second
  run, and the `FORMAT_AMBIGUOUS` and `MISSING_OPTIONS` error envelopes), and interrupt handling
  (`tests/interrupt-releases-locks.e2e.test.ts`: a `translate` run held mid-request by a loopback
  endpoint the test serves, which never answers, exits 130 on SIGINT and 143 on SIGTERM and leaves
  no `*.lock` file behind), and the MCP server's disconnect path (`tests/mcp.e2e.test.ts`: both
  `verbatra mcp` and `verbatra-mcp` answer `initialize` over stdio and exit 0 without an unsettled
  top-level await warning once the client closes stdin, a keyless `translation.editEntry` returns
  the written value, lands it in the locale file and leaves no `*.lock` file behind once stdin
  closes, and `verbatra mcp --allow-spend` exits 0 and leaves no `*.lock` file behind when stdin
  closes while a `translation.translatePending` call is held mid-request by the same kind of
  never-answering loopback endpoint, spending nothing, and `verbatra-mcp --allow-spend` exits 0
  within seconds of a SIGINT or SIGTERM sent during that held call, leaving no `*.lock` file
  behind). It also covers `check --qa` and `--strict` on committed translations
  (`tests/check-qa.e2e.test.ts`), `check --file` on one locale file (a good file, a broken
  placeholder, broken JSON syntax reported with its line and column, and a path that is not a
  locale file; `tests/check-file.e2e.test.ts`), `extract` (`tests/extract.e2e.test.ts`), per-language CLDR plural
  arms (`tests/icu-plural-arms.e2e.test.ts`), plurals missing CLDR categories in `check` and
  `doctor` (`tests/plural-completeness.e2e.test.ts`), inline markup parity on import
  (`tests/markup-parity.e2e.test.ts`), the network policy and `VERBATRA_NETWORK_POLICY` under a live
  network guard (`tests/network-policy.e2e.test.ts`), the provenance file
  (`tests/provenance.e2e.test.ts`), `report provenance` with `--json`, its human table, and a
  corrupt provenance file failing it closed (`tests/report-provenance.e2e.test.ts`), `pseudo` (`tests/pseudo.e2e.test.ts`), the Studio server served
  from the installed package, its `INVALID_PORT` error, and its missing-package hint
  (`tests/studio.e2e.test.ts`), a format adapter built outside verbatra
  (`tests/third-party-adapter.e2e.test.ts`), TMX interchange (`tests/tmx-round-trip.e2e.test.ts`),
  `types` including `--check` and `--out` (`tests/types.e2e.test.ts`), a `libretranslate`
  project with no server and no key (`tests/libretranslate.e2e.test.ts`: `init --provider
  libretranslate`, a `doctor` whose API key check passes without `LIBRETRANSLATE_API_KEY`, a
  character estimate carrying no cost, and a network policy refusing the server before anything is
  sent), and an XLIFF 2.0 handoff exported, filled as a CAT tool would, and imported with its
  review state (`tests/xliff-handoff.e2e.test.ts`). It calls no hosted provider and makes no
  network request outside 127.0.0.1: only the interrupt test and the `--allow-spend` MCP test point
  an `openai-compatible` provider at a never-answering loopback endpoint the test serves, so the
  tier is deterministic and free.

  **This tier is the required release gate.** It runs as the `e2e` job in
  `.github/workflows/ci.yml`, feeds the `Build and test gate` job, and `release.yml` publishes only
  when the CI workflow concludes successfully. A broken CLI cannot reach npm.

- **Live tier** (`tests/translate.live.e2e.test.ts`, `tests/watch.live.e2e.test.ts`,
  `tests/libretranslate.live.e2e.test.ts`; `npm test` runs it alongside the no-key tier): real
  `translate` and `watch` against a live provider.
  `translate` fills a missing key and leaves the project in sync, and on an LLM provider writes
  `sr-Latn` in Latin rather than Cyrillic script; `watch` translates on startup,
  again on a source change, and stops on interrupt. It needs `E2E_PROVIDER` (default `gemini`) and
  the matching API key, and skips otherwise. `.github/workflows/e2e-live.yml` runs it on a nightly
  schedule, on push to `main`, and on manual dispatch only, never on a pull request, with the key
  scoped to the `live-e2e` GitHub Environment.

  **This tier is advisory and never gates a publish**, because its result depends on a third
  party's availability. That is not licence to ignore it: both live tests read each run's `--json`
  record (`src/run-outcome.ts`), and a transient provider fault (a `RATE_LIMITED`,
  `PROVIDER_UNAVAILABLE`, or `TIMEOUT` code on a withheld sub-batch or a failed locale) is reported
  as a skipped test. The skip applies only when every failure in the run is transient: a transient
  fault beside any other provider code, a placeholder-integrity rejection, or a budget withholding
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

Without `VERBATRA_SDK_TARBALL` / `VERBATRA_CLI_TARBALL` / `VERBATRA_STUDIO_TARBALL` /
`VERBATRA_MCP_TARBALL`, global setup builds `@verbatra/sdk`, `@verbatra/cli`, and their workspace
dependencies (which include `@verbatra/studio` and `@verbatra/mcp`), then packs the four tarballs
itself via pnpm, so a stale local `dist/` is never packed by accident. To reuse tarballs you packed
yourself (the CI path), set all four variables; setting only some of them fails setup. The
variables must hold concrete paths (the harness does not expand globs), so resolve them with
`$(ls ...)`:

```sh
# from the repo root
pnpm build
mkdir -p /tmp/packs
pnpm --filter @verbatra/sdk pack --pack-destination /tmp/packs
pnpm --filter @verbatra/cli pack --pack-destination /tmp/packs
pnpm --filter @verbatra/studio pack --pack-destination /tmp/packs
pnpm --filter @verbatra/mcp pack --pack-destination /tmp/packs

cd e2e
VERBATRA_SDK_TARBALL=$(ls /tmp/packs/verbatra-sdk-*.tgz) \
VERBATRA_CLI_TARBALL=$(ls /tmp/packs/verbatra-cli-*.tgz) \
VERBATRA_STUDIO_TARBALL=$(ls /tmp/packs/verbatra-studio-*.tgz) \
VERBATRA_MCP_TARBALL=$(ls /tmp/packs/verbatra-mcp-*.tgz) \
  npm run test:nokey
```

## Running the LibreTranslate live test

`tests/libretranslate.live.e2e.test.ts` runs against a LibreTranslate server you start yourself and
skips unless `LIBRETRANSLATE_URL` is set. No CI workflow starts one, so it runs only locally. It
checks `doctor --live` against the server's `/languages` list, then translates placeholder-bearing
strings under a `local-only` network policy and expects the placeholders back and the project in
sync:

```sh
docker run -d -p 5000:5000 libretranslate/libretranslate --load-only en,de
# wait until http://127.0.0.1:5000/languages answers (the first start downloads the models)
cd e2e
LIBRETRANSLATE_URL=http://127.0.0.1:5000 npx vitest run tests/libretranslate.live.e2e.test.ts
```

`LIBRETRANSLATE_TARGET` picks another target language (default `de`); the server must have its
model loaded. Use a loopback URL, since the test pins the `local-only` network policy.

## Running the placeholder-masking live test

`tests/translate.live.e2e.test.ts` holds one case that only runs when `E2E_PROVIDER` is `deepl` or
`google-translate`: it translates a value with two `{{...}}` placeholders and an ampersand, then
expects both placeholders back byte-exact, no `<x>`, `<span` or `&amp;` left in the result, and
the project in sync. The nightly workflow runs `gemini`, so this case runs only locally:

```sh
cd e2e
E2E_PROVIDER=deepl DEEPL_API_KEY=... npx vitest run tests/translate.live.e2e.test.ts
E2E_PROVIDER=google-translate GOOGLE_TRANSLATE_API_KEY=... npx vitest run tests/translate.live.e2e.test.ts
```

Without the key, every case in the file skips.

## Choosing the live provider

`E2E_PROVIDER` is one of `gemini`, `anthropic`, `openai`, `deepl`, `google-translate`.
Gemini is the default because it has a free API tier, which keeps the nightly smoke
translation at no cost. The matching key (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `DEEPL_API_KEY`, `GOOGLE_TRANSLATE_API_KEY`) must be in the
environment, otherwise the live tier skips.
