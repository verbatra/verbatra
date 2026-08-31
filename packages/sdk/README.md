<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/verbatra/main/.github/assets/verbatra-mark.png" alt="verbatra logo, a glowing V mark on a dark square" width="96" height="96" />
</p>

<h1 align="center">@verbatra/sdk</h1>

<p align="center">
  Programmatic API to automate i18n translation and keep your locale files in sync across languages, using OpenAI, Anthropic, Gemini, DeepL, Google Cloud Translation, or an openai-compatible local or self-hosted model.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@verbatra/sdk"><img src="https://img.shields.io/npm/v/@verbatra/sdk?label=%40verbatra%2Fsdk" alt="@verbatra/sdk npm version" /></a>
  <a href="https://github.com/verbatra/verbatra/actions/workflows/ci.yml"><img src="https://github.com/verbatra/verbatra/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://codecov.io/gh/verbatra/verbatra"><img src="https://codecov.io/gh/verbatra/verbatra/graph/badge.svg" alt="Coverage" /></a>
  <a href="https://github.com/verbatra/verbatra/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
</p>

## Description

`@verbatra/sdk` is the engine behind verbatra: load and validate a config, run the one-shot translate flow over every target locale, watch the source and re-translate on each change, check or diff your locales without writing, validate the whole project setup before you spend anything, or export and import a translator handoff for manual translation. The [`@verbatra/cli`](https://github.com/verbatra/verbatra/tree/main/packages/cli) command is a thin wrapper over this package.

## Requirements

Node.js `>=22.14.0`.

## Installation

```bash
npm install --save-dev @verbatra/sdk
# pnpm
pnpm add -D @verbatra/sdk
# yarn
yarn add -D @verbatra/sdk
```

## Quick start

```ts
import { loadConfig, translate } from "@verbatra/sdk";

// Discovers and validates verbatra.config.ts (or .verbatrarc.json, or a package.json "verbatra" key).
const config = await loadConfig();

// The provider reads its API key from the environment (e.g. GEMINI_API_KEY). No key is passed.
const summary = await translate({ config });

console.log(
  `${summary.succeeded.length} locale(s) done, ${summary.partial.length} partial, ${summary.failed.length} failed`,
);
```

## Defining config

`defineConfig` is an identity helper that gives you full type inference while authoring `verbatra.config.ts`:

```ts
import { defineConfig } from "@verbatra/sdk";

export default defineConfig({
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  format: "i18next-json",
  files: {
    pattern: "locales/{locale}.json",
  },
  provider: {
    id: "gemini",
    options: {
      model: "gemini-2.5-flash", // replace with your provider's model id
      maxOutputTokens: 4096,
    },
  },
});
```

`files.pattern` must contain the `{locale}` token, `targetLocales` must not include `sourceLocale`, and `targetLocales` must not list the same locale twice, compared case-insensitively (two such entries would collide as one Excel worksheet on export); all three are enforced when the config is validated. The supported `format` values are `i18next-json`, `vue-i18n-json`, `next-intl-json`, `ngx-translate-json`, `xliff`, `yaml`, `arb`, and `properties`. JSON-family, YAML, and ARB files round-trip in exact document key order: integer-like keys keep their position, new keys append in source-document order, and a YAML composite key (a map or sequence used as a mapping key) fails with a structured error; a `.properties` write preserves the destination file's existing line endings. The optional `glossary` (a term map, inline or a path to a JSON file of the same shape) and `tone` (`"formal"`, `"informal"`, or `"neutral"`) refine the output. The optional `prune` boolean (off by default) opts in to removing orphaned keys (present in a target file but absent from the source) from the written target files and the lock; the `translate --prune` flag overrides it per run. The optional `generatePlurals` boolean (off by default) opts in to synthesizing the CLDR plural forms a richer target language requires but the source lacks (i18next-JSON projects translated by an LLM provider only; DeepL, non-i18next formats, and unknown languages fall back to the per-locale plural warning and never fail); a per-run `generatePlurals` override on `translate` takes precedence, and generated keys are reported separately from translated keys on the summary. The optional `maxBatchSize` (a positive integer, 50 when absent) caps how many entries go into a single provider request, so a large locale is split into sequential sub-batches and one oversized request cannot sink the whole locale. The optional `maxTokens` sets a whole-run ceiling on input plus output tokens across every provider call, and `budgetBehavior` decides what happens once it is reached: `"warn"` (the default) flags it and lets the run continue, `"stop"` withholds every not-yet-attempted key for the rest of the run so it retries next time. Both are config-only, have no CLI flag, and never change an exit code; against a token-less provider such as DeepL, which reports no usage, the budget stays inert rather than tripping falsely.

Anthropic takes `{ model, maxTokens }`; OpenAI and Gemini take `{ model, maxOutputTokens }`; `openai-compatible` takes the same pair plus a `baseUrl` (for a local or self-hosted server such as LM Studio, Ollama, or vLLM) and an optional `apiKeyEnvVar`; DeepL takes `{}` (with an optional `glossaryId`); Google Cloud Translation (Basic, v2) also takes `{}`, with no glossary or model. Every provider additionally accepts an optional `requestTimeoutMs`, a positive-integer per-request timeout in milliseconds that bounds each outbound call. API keys are never part of the config. Each provider reads its own environment variable (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `DEEPL_API_KEY`, `GOOGLE_TRANSLATE_API_KEY`; `openai-compatible` resolves its key from `apiKeyEnvVar`, then `OPENAI_COMPATIBLE_API_KEY`, then falls back to a keyless placeholder).

## API reference

### `defineConfig(config)`

Returns the config unchanged. It exists purely for type inference and editor autocomplete when authoring a code-defined config. For Anthropic, OpenAI, and Gemini the `model` field is restricted to that provider's known model IDs (sourced from its own SDK), so a model from another provider is a type error at authoring time; the runtime still validates `model` only as a non-empty string, so an unlisted model runs even though the editor flags it. DeepL has no `model` field, and `openai-compatible`'s model is whatever the local server exposes, so neither is restricted.

### `loadConfig(options?): Promise<VerbatraConfig>`

Discovers and validates the configuration. With no arguments it searches upward from the current working directory; `options` accepts `cwd`, an explicit `configPath`, an in-memory `configOverride`, and an `fs` seam. Precedence is `configOverride`, then `configPath`, then the search. Resolves to the validated `VerbatraConfig`, and throws an `SdkError` if no config is found (`CONFIG_NOT_FOUND`) or it fails validation (`CONFIG_INVALID`). A `glossary` given as a file path is read and validated here, so every downstream call receives a plain term map.

### `translate(input): Promise<RunSummary>`

Runs the one-shot read, diff, translate, write flow over every target locale. `input` is a `TranslateInput`: `{ config, cwd?, locales?, dryRun?, prune?, generatePlurals?, cache?, concurrency?, lockAcquireTimeoutMs?, onProgress?, onLockWait? }`. With `dryRun: true` it reads, diffs, and reports without calling the provider or writing anything. `locales` narrows the run to a subset of the configured target locales, exactly as it does on `check` and `diff`, and a locale that is not configured raises `UNKNOWN_LOCALE` before anything is read or spent. `prune` and `generatePlurals` each override the matching config option for this run.

`cache` (on by default, and ignored on a dry run) toggles the local content-addressed translation-memory cache in `verbatra.cache.json`: a key whose source content is unchanged, including under a renamed key or shared with another key, is served from the cache instead of being re-sent to the provider. A cached value is re-checked against that key's own current source first, and one that fails the gate falls through to the provider rather than being written. `concurrency` (defaults to 1, strictly serial) is how many target locales may run at once; it must be an integer of at least 1, and on a live run a value above 1 is refused when the config sets `maxTokens`, because concurrent locales would overshoot the budget nondeterministically. `lockAcquireTimeoutMs` overrides how long a locale's write lock keeps retrying before it fails. `onProgress` receives a structured event once per locale before and after it runs, once per provider sub-batch, and once when the locale loop ends; `onLockWait` fires while a locale's write lock is blocked on another process holding it. The SDK writes to no stream, so these callbacks are the only progress signal.

Resolves to a `RunSummary`: `dryRun`, `locales`, `succeeded`, `partial`, `failed`, plus `usage` when any provider call reported tokens and `budget` when `maxTokens` is configured. A locale's `status` is `"succeeded"` when nothing was withheld (a no-op with no candidate keys included), `"partial"` when it accepted at least one key and withheld at least one, and `"failed"` when it withheld keys and accepted none, or threw. Each `LocaleSummary` carries `locale`, `status`, `translated`, `unchanged`, `orphaned`, `pruned`, `invalidIcuSource`, `cacheHits`, `integrityMismatches`, `providerFailures`, `budgetWithheld`, `generated`, `notices`, `needsReview`, `unfilled`, `malformedRows`, `duplicateKeys`, an optional `usage`, and an optional `error` on a locale that threw. `cacheHits` are keys served from the translation-memory cache rather than the provider. `integrityMismatches` is a translation that came back and was withheld by verbatra's integrity gate, whose rejection reasons are the exported `IntegrityGateReason` union. `providerFailures` is a key withheld because nothing was translated for it (the provider call failed, or the response was still missing that key), with any secret-free failure code and message reported in `notices`. `budgetWithheld` is a candidate never sent because a `maxTokens` budget in `"stop"` mode had already tripped. `needsReview` flags accepted keys the review heuristics want a human to look at, and never withholds anything. `unfilled`, `malformedRows`, and `duplicateKeys` are populated only by `importWorkbook`, which returns this same shape. Every withheld key keeps its prior lock hash and is retried next run.

Whole-run failures throw an `SdkError`: an unknown format, a `locales` entry that is not a configured target, provider construction (including a missing API key), an unreadable or invalid source file, a corrupt lock file, an invalid `concurrency`, or the concurrency-and-budget conflict above. A per-locale failure never throws; it is isolated on that locale's summary. On a non-dry run the flow also writes `.verbatra-local/run-status.json` (best-effort, read back through `runStatus`).

```ts
const preview = await translate({ config, dryRun: true });
```

### `watch(input): Promise<WatchController>`

Watches the source file and re-runs the translate flow on each debounced change. `input` is `{ config, cwd?, locales?, debounceMs?, onRun, cache?, concurrency?, lockAcquireTimeoutMs?, onLockWait?, onProgress? }`; `debounceMs` defaults to 300, `locales` narrows every run of the session to a subset of the configured target locales and is validated once at startup rather than per cycle, and the last five are passed straight through to every run. One run starts immediately at startup, before any change arrives. Runs are serialized, so changes during a run collapse into a single follow-up.

`onRun` receives a `WatchRunResult` per run: `{ status: "succeeded", summary }` or `{ status: "failed", error }` with a secret-free `{ code, message }`, so a failing run is reported and watching continues. `watch` itself throws only at startup: `UNKNOWN_LOCALE` for a `locales` entry that is not a configured target, `CONCURRENCY_INVALID` or `CONCURRENCY_BUDGET_CONFLICT` for a `concurrency` no cycle could honor (resolved once, before the watcher exists, rather than failing every cycle), and `SOURCE_UNREADABLE` when the source locale file is absent. Resolves to a `WatchController` whose `stop()` closes the watcher and awaits the in-flight run.

```ts
import { loadConfig, watch } from "@verbatra/sdk";

const config = await loadConfig();
const controller = await watch({
  config,
  onRun: (result) => console.log(result.status),
});

// Stop cleanly on Ctrl-C.
process.on("SIGINT", () => void controller.stop());
```

### `check(input): Promise<CheckSummary>`

Reports per-locale drift without calling a provider, writing any file, or touching the lock. `input` is `{ config, cwd?, locales? }`, where `locales` narrows the check to a subset of target locales (defaults to all configured). Resolves to a `CheckSummary` whose `locales` lists one `LocaleCheckSummary` each (counts only: `missing`, `stale`, `upToDate`, and a per-locale `inSync`); the top-level `inSync` is true only when every checked locale is in sync.

```ts
import { check, loadConfig } from "@verbatra/sdk";

const config = await loadConfig();
const summary = await check({ config });

if (!summary.inSync) {
  console.log("Locales are out of sync; run verbatra translate.");
}
```

### `diff(input): Promise<DiffSummary>`

Lists the keys a run would touch, without writing anything. `input` is the same `{ config, cwd?, locales? }` shape as `check`. Resolves to a `DiffSummary` whose `locales` lists one `LocaleDiff` each, with the key arrays `missing` (would be added), `changed` (would be re-translated), and `orphaned` (present in the target but absent from the source), plus a per-locale `hasPendingChanges` driven by `missing` and `changed` only, since a default run does not prune. The top-level `hasPendingChanges` is true when any checked locale has some.

```ts
import { diff, loadConfig } from "@verbatra/sdk";

const config = await loadConfig();
const summary = await diff({ config });
```

### `doctor(input?): Promise<DoctorResult>`

Validates the project setup and spends nothing: no provider is constructed, no network request is made, no file is written, and no API key value is ever read. `input` is `{ cwd?, configPath? }`, and it is optional as a whole because `doctor` loads the config itself, so a project with no config at all still gets a report rather than a thrown error. Five checks run, one per `DoctorCheckId`: `"config"` (a config was found and validates), `"format-adapter"` (the configured `format` resolves to an adapter), `"provider"` (the configured `provider.id` resolves to a factory), `"api-key"` (the environment variable that provider reads its key from is set), and `"source-file"` (the source locale file exists at its resolved path). Every check runs even when an earlier one failed, so one call reports every independent problem; when the config itself cannot be loaded, the four checks that depend on it report `"skipped"` instead of a verdict they could not reach. Resolves to a `DoctorResult` whose `ok` is true only when no check failed, and whose `checks` carry an `id`, a stable `title`, a `status` of `"pass"`, `"fail"`, or `"skipped"`, and a `detail` naming the variable or path behind the verdict but never a key value. Throws `CONFIG_NOT_FOUND` only for an explicit `configPath` that does not exist; a config that is merely absent from the search is a failed check instead.

```ts
import { doctor } from "@verbatra/sdk";

const report = await doctor();

for (const entry of report.checks) {
  console.log(`${entry.status}: ${entry.title} - ${entry.detail}`);
}

process.exitCode = report.ok ? 0 : 1;
```

### `exportWorkbook(input): Promise<ExportWorkbookResult>`

Exports the strings that need translating into a handoff for a human translator. `input` is `{ config, cwd?, out?, locales?, includeUnchanged?, format? }`. By default it writes the missing and changed strings for every target locale; `locales` narrows which target locales are exported, and `includeUnchanged: true` also exports already up-to-date strings. No provider is called and no lock file is written.

`format` is an `ExchangeFormat`, one of the exported `EXCHANGE_FORMATS` and defaulting to `DEFAULT_EXCHANGE_FORMAT` (`"xlsx"`). With `"xlsx"` it writes one styled workbook with a sheet per locale to `DEFAULT_WORKBOOK_PATH` (`verbatra-translations.xlsx`). With `"csv"` or `"tsv"` it writes one plain `<locale>.csv` or `<locale>.tsv` per exported locale into a directory, `DEFAULT_DELIMITED_PATH` (`verbatra-translations`) by default, creating it if it is missing, and it also leaves a hidden manifest there naming the locales it wrote, which is what lets a later import reject a file left over from a wider export. `out` overrides the default: a file path for `"xlsx"`, a directory for the delimited formats. Resolves to an `ExportWorkbookResult` with the absolute `path` written (the shared directory when one file per locale was written) and a per-locale row count.

### `importWorkbook(input): Promise<RunSummary>`

Imports a filled handoff back into the locale files, gating every row through the same integrity gate as `translate` on top of a fresh source-drift check. `input` is `{ config, workbook, cwd?, dryRun?, format? }`. With `dryRun: true` it validates and reports without writing locale files or updating the lock.

`format` takes the same `ExchangeFormat` values as `exportWorkbook` and must match how the handoff was written. For `"xlsx"`, `workbook` is the workbook file and the locale comes from the sheet name. For `"csv"` and `"tsv"` the locale comes from the file name instead, and `workbook` is tried as a single `<locale>.csv` file first, so one locale can be imported on its own; if no file exists there it is read as the directory the per-locale files were written into. A file in that directory that the most recent export's manifest does not list is refused as a leftover rather than applied, and reported as that locale's failure with `HANDOFF_FILE_STALE`; a directory with no readable manifest is read as it always was, with every file present imported. Resolves to a `RunSummary`, the same shape `translate` returns: a row the translator left blank whose key still needs a translation is reported in that locale's `unfilled` (nothing is written and the prior lock baseline is kept), an unreadable row in `malformedRows`, a repeated key in `duplicateKeys` (the first occurrence wins), and a configured target locale whose sheet or delimited file is missing from the handoff is reported as that locale's failed summary rather than silently dropped. `unfilled`, `malformedRows`, and `duplicateKeys` do not feed a locale's `status`, so a partly filled sheet still imports the rows it has. A key is cleared by filling its Translation cell with the `[[CLEAR]]` sentinel; an ordinary blank never clears a value.

```ts
import { exportWorkbook, importWorkbook, loadConfig } from "@verbatra/sdk";

const config = await loadConfig();

// Export the strings that need translating to an Excel workbook.
const { path } = await exportWorkbook({ config });

// ...a human fills the Translation column, then import the file back.
const summary = await importWorkbook({ config, workbook: path });
```

See [Manual translation](https://verbatra.kreitz-webdev.de/docs/manual-translation) for the full round-trip and the workbook layout.

### More entry points

Beyond the flows above, the SDK exports the building blocks Verbatra Studio and other tooling sit on. Most are a one-call read or a locked single-key write:

- `keyIntegrity` reports, per changed key, whether its placeholders still match the source (with the missing and extra tokens on a mismatch) and whether the current target value is still valid ICU.
- `lockState` reports the lock file's existence, version, and per-locale drift; `loadLockFile` reads the lock file itself.
- `runStatus` reads the persisted review-flag and token-usage snapshot the last non-dry `translate` or `watch` run left behind; it never throws, and a missing, corrupt, or unrecognized file simply reports as unavailable.
- `keyValue` reads one key's current source and target values.
- `editEntry` saves a manually edited translation for one key, and `retranslateEntry` re-runs the provider for one key; both run the candidate through the same integrity gate as a full run (a rejection names an `IntegrityGateReason` and writes nothing) and hold the same per-locale write lock.
- `readLocaleFileSnapshot` and `diffLocaleSnapshots` snapshot one locale file as per-key content hashes and compare two snapshots, the primitives behind live-refresh watching.
- `loadConfigWithMeta` is `loadConfig` plus config-source and glossary provenance.
- `readGlossaryFile` reads a file-backed glossary fresh from disk, under the same validation `loadConfig` applies, for a long-running tool that has to show the glossary as it is now rather than as it was when the config was loaded. `updateGlossaryTerm` adds, replaces, or removes exactly one term (`translation: null` removes it) and returns the glossary as it now stands, keeping the file's existing key order and indentation. Both take the `GlossaryProvenance` from `loadConfigWithMeta` rather than a path, so the file they touch is always the one the config names. A write runs under a project-wide glossary lock and replaces the file atomically. Only a file-backed glossary can be read or changed this way: a glossary written inline in the config module is refused with `GLOSSARY_NOT_FILE_BACKED` rather than rewritten, and a failed write is `GLOSSARY_UNWRITABLE`.

The rest are the values a tool needs to agree with verbatra rather than restate it:

- `createLocalePathResolver` builds the two-way locale-to-path mapping from the `sourceLocale`, `targetLocales`, and `files` slice of a config: `pathFor(locale)` gives a locale's absolute file path and `localeFor(path)` gives the configured locale owning a path, which is how a file watcher decides whether a change concerns verbatra at all.
- `EXCHANGE_FORMATS`, `DEFAULT_EXCHANGE_FORMAT`, `DEFAULT_WORKBOOK_PATH`, and `DEFAULT_DELIMITED_PATH` are the handoff formats and their default output paths, so a `--format` argument can be validated and offered without restating the list. `EXCHANGE_FORMATS` is derived from the `ExchangeFormat` type itself, so it can never drift behind a format the SDK accepts.
- `CACHE_FILE_NAME` and `LOCK_FILE_NAME` are the names of the two files a run maintains in the project (`verbatra.cache.json` and `verbatra.lock.json`), for tooling that has to find, gitignore, or clear them.
- `verbatraConfigSchema` is the zod schema `loadConfig` validates against, for validating a config object you assembled yourself. The same schema is published as a JSON Schema document at `@verbatra/sdk/config-schema.json`, generated at build time, so an editor can complete and validate a `.verbatrarc.json` or YAML config; the config accepts an optional top-level `$schema` key to point at it, which is ignored at runtime. `scaffoldingMetadata` carries the facts a project generator needs to write a first config (each provider's key environment variable, a starting model, the token-limit option name it takes, and the supported formats), which is what `verbatra init` renders from. Neither holds an API key value.
- `SdkFs` is the file-system port every file the SDK touches goes through, so supplying your own as the `deps.fs` option redirects all of it and an entire run can be held in memory: the run-status file, the lock file, the config glossary, the workbook and delimited I/O, and the locale files themselves, which the format adapters read and write through a port built from this one. Reads are size-bounded by contract and writes are expected to be atomic. The single exception is a caller-supplied `deps.adapterRegistry`: those adapters were constructed by you, so `deps.fs` cannot reach them and passing both means you own that wiring.

## Errors and results

`SdkError` is the SDK's own structured error type, thrown for whole-run failures such as a missing or invalid config or an unreadable source file. It carries a stable `code` from the exported `SdkErrorCode` union and never contains an API key. It is not the only error a caller can see: `retranslateEntry` propagates the provider's own `ProviderError` when the provider call fails or returns nothing for the key, and a target locale file that exists but is malformed rejects with the adapter's own error.

Per-locale failures do not throw: they are recorded on the `RunSummary` so one failing locale never aborts the others, and that includes a locale whose write lock could not be acquired. A locale's `error.code` is a preserved string from the underlying provider or adapter failure (`"LOCALE_FAILED"` is only the fallback), deliberately wider than `SdkErrorCode`, so do not treat it as a closed set.

## Documentation

- [Documentation site](https://verbatra.kreitz-webdev.de)
- [Project README](https://github.com/verbatra/verbatra)
- [`@verbatra/cli`](https://github.com/verbatra/verbatra/tree/main/packages/cli) for the command-line tool

## License

[MIT](https://github.com/verbatra/verbatra/blob/main/LICENSE) (c) Mario Kreitz
