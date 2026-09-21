<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/verbatra/main/.github/assets/verbatra-mark.png" alt="verbatra logo, a glowing V mark on a dark square" width="96" height="96" />
</p>

<h1 align="center">@verbatra/sdk</h1>

<p align="center">
  Programmatic API to automate i18n translation and keep your locale files in sync across languages, using OpenAI, Anthropic, Gemini, DeepL, Google Cloud Translation, or an openai-compatible local or self-hosted model.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@verbatra/sdk"><img src="https://img.shields.io/npm/v/%40verbatra%2Fsdk?label=%40verbatra%2Fsdk&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="@verbatra/sdk npm version" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/sdk"><img src="https://img.shields.io/npm/types/%40verbatra%2Fsdk?color=7b1fa2&amp;labelColor=0b0b12" alt="Ships TypeScript types" /></a>
  <a href="https://github.com/verbatra/verbatra/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/verbatra/verbatra/ci.yml?branch=main&amp;label=CI&amp;labelColor=0b0b12" alt="CI status on main" /></a>
  <a href="https://github.com/verbatra/verbatra/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?color=7b1fa2&amp;labelColor=0b0b12" alt="License: MIT" /></a>
</p>

## Description

`@verbatra/sdk` is the engine behind verbatra: load and validate a config, translate every target locale once, watch the source and re-translate on each change, check or diff your locales without writing, validate the whole project setup before you spend anything, extract keys from your application source, or hand strings off to a human translator and read them back. Each run diffs your source against the lock file and sends only what changed, and every candidate value, whatever produced it, passes one integrity gate before it is written. [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli) is a thin wrapper over this package.

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

`files.pattern` must contain the `{locale}` token, and `targetLocales` must neither include `sourceLocale` nor list one locale twice. Beyond the required keys, the config carries optional `glossary` and `tone`, opt-in `prune` and `generatePlurals`, per-key `maxLength` review budgets, and the `maxTokens`/`budgetBehavior` run budget. Every key, every default, and every provider's option shape is documented on the [Configuration page](https://verbatra.kreitz-webdev.de/docs/config-file); the providers and their key variables are on the [Providers page](https://verbatra.kreitz-webdev.de/docs/providers).

API keys are never part of the config. Each provider reads its own environment variable, and the SDK never accepts one as an argument.

## API reference

Every flow takes an `input` object and an optional `deps` object for injecting the file system, the provider factory, or an adapter registry of your own; the two config helpers below take neither. The signatures below are the ones the package publishes in `dist/index.d.ts`.

### `defineConfig(config): VerbatraConfigInput`

Identity helper that types a config literal against the provider you name in `provider.id`. See [Configuration](https://verbatra.kreitz-webdev.de/docs/config-file).

### `loadConfig(options?): Promise<VerbatraConfig>`

Discover, load, and validate the project config, searching upward from the working directory. Throws an `SdkError` when no config is found or validation fails.

### `translate(input, deps?): Promise<RunSummary>`

Translate every configured target locale once. The summary splits locales into succeeded, partial, and failed, and carries the run's notices, review flags, token usage, and budget standing. See [`verbatra translate`](https://verbatra.kreitz-webdev.de/docs/cli/translate).

### `watch(input, deps?): Promise<WatchController>`

Watch the source locale file and re-translate on every change until the returned controller is stopped. Each run gets a fresh budget. See [`verbatra watch`](https://verbatra.kreitz-webdev.de/docs/cli/watch).

### `check(input, deps?): Promise<CheckSummary>`

Count missing, stale, and up-to-date keys per locale. Calls no provider and writes nothing. See [`verbatra check`](https://verbatra.kreitz-webdev.de/docs/cli/check).

### `diff(input, deps?): Promise<DiffSummary>`

Name the keys that would be added, re-translated, or orphaned per locale. Calls no provider and writes nothing. See [`verbatra diff`](https://verbatra.kreitz-webdev.de/docs/cli/diff).

### `doctor(input?, deps?): Promise<DoctorResult>`

Validate the config, the format adapter, the provider, its key variable, and the source locale file in one pass, reporting every problem at once. Reads no key value. See [`verbatra doctor`](https://verbatra.kreitz-webdev.de/docs/cli/doctor).

### `extract(input, deps?): Promise<ExtractResult>`

Scan your application source for translation call sites and add the new keys to the source locale file. See [`verbatra extract`](https://verbatra.kreitz-webdev.de/docs/cli/extract).

### `generateTypes(input, deps?): Promise<GenerateTypesResult>`

Generate a TypeScript declaration of every source catalog key and the arguments its message interpolates. See [`verbatra types`](https://verbatra.kreitz-webdev.de/docs/cli/types).

### `pseudolocalize(input, deps?): Promise<PseudolocalizeResult>`

Build a pseudolocale from the source strings, accented, expanded, and bracketed, without calling a provider. See [`verbatra pseudo`](https://verbatra.kreitz-webdev.de/docs/cli/pseudo).

### `exportWorkbook(input, deps?): Promise<ExportWorkbookResult>`

Write the strings that need translating to a translator handoff: a styled Excel workbook, or one CSV or TSV file per locale. See [Manual translation](https://verbatra.kreitz-webdev.de/docs/manual-translation).

### `importWorkbook(input, deps?): Promise<RunSummary>`

Read a filled handoff back into the locale files, through the same integrity gate a translate run applies, returning the same `RunSummary` shape.

### `exportTmx(input, deps?)` and `importTmx(input, deps?)`

Move the whole translation memory out as a TMX file any other translation tool can read, or read one in. See [`verbatra tmx`](https://verbatra.kreitz-webdev.de/docs/cli/tmx).

### More entry points

The remaining exports are the building blocks Verbatra Studio, the MCP server, and other tooling sit on. Most are a one-call read or a locked single-key write.

| Export | What it does |
| --- | --- |
| `editEntry`, `retranslateEntry` | Save a manual translation for one key, or re-run the provider for one key. Both run the candidate through the same integrity gate as a full run and hold the same per-locale write lock; a rejection names an `IntegrityGateReason` and writes nothing |
| `keyValue`, `localeValues` | Read one key's current source and target values, or a whole locale's key/value pairs |
| `keyIntegrity` | Report, per changed key, whether its placeholders, inline markup, and ICU still match the locked baseline |
| `lockState`, `loadLockFile` | Read the lock file's existence, version, and per-locale drift, or the lock file itself |
| `runStatus`, `budgetStanding` | Read the review-flag and token-usage snapshot the last non-dry run left behind, and turn a `RunBudget` into a standing |
| `readLocaleFileSnapshot`, `diffLocaleSnapshots` | Snapshot one locale file as per-key content hashes and compare two snapshots: the primitives behind live-refresh watching |
| `loadConfigWithMeta`, `readGlossaryFile`, `updateGlossaryTerm` | `loadConfig` plus config-source and glossary provenance, and the file-backed glossary read and single-term write that take that provenance rather than a path |
| `createLocalePathResolver` | Build the two-way locale-to-path mapping from a config, so a watcher can decide whether a changed file concerns verbatra at all |
| `createDefaultRegistry`, `createTreeFileAdapter`, `createFlatFileAdapter`, `AdapterRegistry`, `nodeAdapterFs` | The format-adapter construction surface: build an adapter for a format verbatra does not ship and hand the registry to a flow as `deps.adapterRegistry` |
| `verbatraConfigSchema`, `scaffoldingMetadata` | The zod schema `loadConfig` validates against (also published as `@verbatra/sdk/config-schema.json`), and the facts a project generator needs to write a first config |
| `LOCK_FILE_NAME`, `CACHE_FILE_NAME`, `EXCHANGE_FORMATS`, `DEFAULT_EXCHANGE_FORMAT`, `DEFAULT_WORKBOOK_PATH`, `DEFAULT_DELIMITED_PATH`, `DEFAULT_TMX_PATH`, `DEFAULT_TYPES_PATH` | The file names and handoff formats a run uses, so tooling can find, offer, or gitignore them without restating the list |
| `SdkFs`, `redact`, `resolveDryRun`, `isCustomFormatId`, `tmxErrorLocation` | The file-system port every file the SDK touches goes through, the secret-redaction pass, and small helpers for agreeing with verbatra rather than restating it |

## Errors and results

`SdkError` is the SDK's own structured error type, thrown for whole-run failures such as a missing or invalid config or an unreadable source file. It carries a stable `code` from the exported `SdkErrorCode` union and never contains an API key. It is not the only error a caller can see: `retranslateEntry` propagates the provider's own `ProviderError`, and a target locale file that exists but is malformed rejects with the adapter's own `AdapterError`.

Per-locale failures do not throw. They are recorded on the `RunSummary` so one failing locale never aborts the others, including a locale whose write lock could not be acquired. A locale's `error.code` is a preserved string from the underlying provider or adapter failure (`"LOCALE_FAILED"` is only the fallback), deliberately wider than `SdkErrorCode`, so do not treat it as a closed set.

## Documentation

- [Documentation site](https://verbatra.kreitz-webdev.de)
- [SDK reference](https://verbatra.kreitz-webdev.de/docs/sdk)
- [Configuration](https://verbatra.kreitz-webdev.de/docs/config-file)
- [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli) for the command-line tool

## License

[MIT](https://github.com/verbatra/verbatra/blob/main/LICENSE) (c) Mario Kreitz
