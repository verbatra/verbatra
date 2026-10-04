---
"@verbatra/sdk": minor
"@verbatra/cli": patch
---

CommonJS entry and types, `./package.json` export, and new SDK exports.

**Packaging**
- A `verbatra.config.cjs` can `require("@verbatra/cli")`, and `@verbatra/sdk` gives `require` its
  own declarations (`index.d.cts`).
- Every published package exports `./package.json`.
- The spreadsheet libraries load only for an `xlsx` handoff, and each provider SDK only on its
  first provider call, so commands that call no provider (`check`, `diff`, `--version`) start
  faster.

**SDK exports**
- `ProviderError`, `ProviderErrorCode` and the provider contract types (`TranslationProvider`,
  `TranslateRequest`, `TranslateResult` and more) for a custom `createProvider`.
- The rest of that contract is exported too: `ProviderNotice`, `ProviderNoticeCode`, `Usage`,
  `ReviewFlag`, `Tone`, `PluralCategories`, `PlaceholderExtractor`, `PlaceholderComparator`,
  `NetworkPolicy` and `NetworkRule`, plus `SourceExtractor`, `BoundedFileRead`,
  `BoundedBytesRead`, `AuthoringConfig` and `AuthoringConfigFor`. The published types name
  `TranslationEntry`, `LocaleResource` and the other core types once, under their exported names.
- `loadConfig({ fresh })` evaluates an edited JavaScript or TypeScript config again, and
  `configCandidatePaths` lists the files a config could come from.
- `keyContext` reads what is needed to write one key: its values, the glossary terms that apply,
  `maxLength` and a check of a draft. `localeHistory` lists the git commits that touched the locale
  files, with the author name and never the email, or a `reason` when it cannot read them.
- `localeValues` lists each locale's keys in source order under `keys`.
- `localeValuesPage` reads those values one page at a time, narrowed by `keys` or `query`, and
  `provenanceReportPage` pages the entries of `provenanceReport` by bucket. A stale cursor throws
  `PAGE_CURSOR_INVALID`, a limit outside 1 to `PAGE_LIMIT_CAP` throws `PAGE_LIMIT_INVALID`.
- `runStatus` says why it found no usable status: `available: false` now carries a `reason` from
  `RUN_STATUS_UNAVAILABLE_REASONS` (`no-status-file`, `unreadable`, `invalid`,
  `unsupported-version`).
- `translate` and `retranslateEntry` take a `signal` to cancel a running translation. Finished
  batches stay written and recorded, unsent keys stay pending, and locks are released;
  `RunSummary.cancelled` and the `RUN_CANCELLED` code report what was cut short.
