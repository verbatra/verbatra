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
- `loadConfig({ fresh })` evaluates an edited JavaScript or TypeScript config again, and
  `configCandidatePaths` lists the files a config could come from.
- `keyContext` reads what is needed to write one key: its values, the glossary terms that apply,
  `maxLength` and a check of a draft. `localeHistory` lists the git commits that touched the locale
  files, with the author name and never the email, or a `reason` when it cannot read them.
- `localeValues` lists each locale's keys in source order under `keys`.
