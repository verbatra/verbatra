<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/verbatra/main/.github/assets/verbatra-mark.png" alt="verbatra logo, a glowing V mark on a dark square" width="96" height="96" />
</p>

<h1 align="center">@verbatra/sdk</h1>

<p align="center">
  The programmatic API behind verbatra: translate your locale files incrementally, and never write a translation that breaks a placeholder.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@verbatra/sdk"><img src="https://img.shields.io/npm/v/%40verbatra%2Fsdk?label=%40verbatra%2Fsdk&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="@verbatra/sdk npm version" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/sdk"><img src="https://img.shields.io/npm/types/%40verbatra%2Fsdk?color=7b1fa2&amp;labelColor=0b0b12" alt="Ships TypeScript types" /></a>
  <a href="https://github.com/verbatra/verbatra/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/verbatra/verbatra/ci.yml?branch=main&amp;label=CI&amp;labelColor=0b0b12" alt="CI status on main" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/sdk#provenance"><img src="https://img.shields.io/badge/npm%20provenance-SLSA%20v1-7b1fa2?labelColor=0b0b12" alt="npm provenance: SLSA v1 build attestation" /></a>
  <a href="https://github.com/verbatra/verbatra/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?color=7b1fa2&amp;labelColor=0b0b12" alt="License: MIT" /></a>
</p>

<p align="center">
  <a href="https://verbatra.kreitz-webdev.de/docs/sdk">Documentation</a> |
  <a href="https://verbatra.kreitz-webdev.de/docs/sdk-quickstart">Quickstart</a> |
  <a href="https://github.com/verbatra/verbatra/blob/main/packages/sdk/CHANGELOG.md">Changelog</a> |
  <a href="https://github.com/verbatra/verbatra/issues">Issues</a>
</p>

## Description

`@verbatra/sdk` is the engine behind verbatra: load and validate a config, translate every target locale once, watch the source and re-translate on each change, check or diff your locales without writing, validate the whole project setup before you spend anything, extract keys from your application source, or hand strings off to a human translator and read them back. Each run diffs your source against the lock file and sends only what changed, and every candidate value, whatever produced it, passes one integrity gate before it is written. [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli) is a thin wrapper over this package.

## Installation

```bash
npm install --save-dev @verbatra/sdk
```

Needs Node.js `^22.18.0 || >=24`. The package ships its own TypeScript types and a CommonJS and an ES module build.

## Quick start

```ts
import { loadConfig, translate } from "@verbatra/sdk";

const config = await loadConfig();
const summary = await translate({ config });

console.log(
  `${summary.succeeded.length} locale(s) done, ${summary.partial.length} partial, ${summary.failed.length} failed`,
);
```

`loadConfig` finds and validates `verbatra.config.ts` (or `.js` or `.cjs`), a `.verbatrarc` file with no extension or a `.json`, `.yaml`, `.yml`, `.js`, `.cjs` or `.ts` one, or a `package.json` `"verbatra"` key. The provider reads its API key from the environment, for example `GEMINI_API_KEY`; no key is ever passed to the SDK. The [SDK quickstart](https://verbatra.kreitz-webdev.de/docs/sdk-quickstart) walks through the first run step by step, from a keyless dry run to a CI gate, and [SDK recipes](https://verbatra.kreitz-webdev.de/docs/programmatic-api) has complete examples for the other entry points.

## Configuration

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
      model: "gemini-2.5-flash",
      maxOutputTokens: 4096,
    },
  },
});
```

Every optional key, every default, and every provider's option shape is documented on the [Configuration page](https://verbatra.kreitz-webdev.de/docs/config-file); the providers and their key variables are on the [Providers page](https://verbatra.kreitz-webdev.de/docs/providers). API keys are never part of the config.

## API overview

Every flow takes an `input` object and an optional `deps` object for injecting the file system, the provider factory, or an adapter registry of your own. The signatures are the ones the package publishes in `dist/index.d.ts`; each row links to the docs page that holds the full reference.

| Area | Exports | Reference |
| --- | --- | --- |
| Run | `translate`, `watch`, `pseudolocalize`, `generateTypes`, `resolveDryRun` | [Run](https://verbatra.kreitz-webdev.de/docs/sdk/run) |
| Inspect, read-only | `check`, `checkFile`, `diff`, `doctor`, `dataFlow`, `extract`, `lockState`, `runStatus`, `reviewQueue`, `provenanceReport`, `localeIntegrity` | [Inspect](https://verbatra.kreitz-webdev.de/docs/sdk/inspect) |
| Single keys and review | `keyValue`, `keyContext`, `keyIntegrity`, `localeValues`, `editEntry`, `retranslateEntry`, `approveEntry`, `rejectEntry`, `approveLocale`, `approveEntries`, `rejectEntries`, `retranslateEntries`, `localeHistory` | [Review](https://verbatra.kreitz-webdev.de/docs/sdk/review) |
| Handoff | `exportWorkbook`, `importWorkbook`, `exportTmx`, `importTmx`, `readLocaleFileSnapshot`, `diffLocaleSnapshots`, `createLocalePathResolver` | [Exchange](https://verbatra.kreitz-webdev.de/docs/sdk/exchange) |
| Config and glossary | `defineConfig`, `loadConfig`, `loadConfigWithMeta`, `detectProject`, `verbatraConfigSchema`, `readGlossaryFile`, `updateGlossaryTerm`, `glossaryHits`, `glossaryDraftCheck`, `isMachineTranslationEnabled`, `assertMachineTranslationEnabled` | [Config](https://verbatra.kreitz-webdev.de/docs/sdk/config) |
| Extension points | `createDefaultRegistry`, `createTreeFileAdapter`, `createFlatFileAdapter`, `AdapterRegistry`, `nodeAdapterFs`, `redact`, `declareProviderKeyEnvVar`, `releaseHeldLocks` | [Extend](https://verbatra.kreitz-webdev.de/docs/sdk/extend) |
| JSON schemas | `SDK_JSON_SCHEMAS`, `renderJsonSchemas`, `renderOutputJsonSchema`, `jsonSchemaUrl`, and one zod schema per result, such as `runSummarySchema` and `checkSummarySchema` | [JSON schemas](https://verbatra.kreitz-webdev.de/docs/sdk/json-schemas) |
| Constants | `LOCK_FILE_NAME`, `CACHE_FILE_NAME`, `PROVENANCE_FILE_NAME`, `EXCHANGE_FORMATS`, `INTEGRITY_GATE_REASONS`, `REVIEW_REASON_CODES`, `QA_SEVERITIES` | [Inspect](https://verbatra.kreitz-webdev.de/docs/sdk/inspect), [Run](https://verbatra.kreitz-webdev.de/docs/sdk/run), [Exchange](https://verbatra.kreitz-webdev.de/docs/sdk/exchange), [Review](https://verbatra.kreitz-webdev.de/docs/sdk/review) |

The package also publishes the config JSON Schema as `@verbatra/sdk/config-schema.json` and the result schemas under `@verbatra/sdk/schemas/*`, for editor validation and for consumers outside TypeScript.

## Errors and results

`SdkError` is the SDK's own structured error, thrown for whole-run failures such as a missing or invalid config or an unreadable source file. It carries a stable `code` from the exported `SdkErrorCode` union and never contains an API key. Per-locale failures do not throw: they are recorded on the `RunSummary` so one failing locale never aborts the others. The full model, including `ProviderError` and `AdapterError`, is on the [Errors page](https://verbatra.kreitz-webdev.de/docs/sdk/errors), and every code is listed in the [error code reference](https://verbatra.kreitz-webdev.de/docs/error-codes).

## Documentation

- [SDK reference](https://verbatra.kreitz-webdev.de/docs/sdk)
- [SDK quickstart](https://verbatra.kreitz-webdev.de/docs/sdk-quickstart)
- [Configuration](https://verbatra.kreitz-webdev.de/docs/config-file)
- [Custom format adapters](https://verbatra.kreitz-webdev.de/docs/custom-format-adapters)

## Related packages

- [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli): the `verbatra` command, a thin wrapper over this package.
- [`@verbatra/studio`](https://www.npmjs.com/package/@verbatra/studio): the local dashboard.
- [`@verbatra/mcp`](https://www.npmjs.com/package/@verbatra/mcp): a stdio MCP server for coding agents.

## Contributing

See [CONTRIBUTING.md](https://github.com/verbatra/verbatra/blob/main/CONTRIBUTING.md).

## License

[MIT](https://github.com/verbatra/verbatra/blob/main/LICENSE) (c) Mario Kreitz
