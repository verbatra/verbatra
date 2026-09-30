---
"@verbatra/sdk": minor
"@verbatra/cli": patch
---

CommonJS entry and types, `./package.json` export, lazy spreadsheet libraries, exported
`ProviderError` and provider contract types, and `loadConfig({ fresh })`.

**Packaging**
- A `verbatra.config.cjs` can `require("@verbatra/cli")`, and `@verbatra/sdk` gives `require` its
  own declarations (`index.d.cts`).
- Every published package exports `./package.json`.
- The spreadsheet libraries load only for an `xlsx` handoff, so other commands start faster.

**SDK exports**
- `ProviderError`, `ProviderErrorCode` and the provider contract types (`TranslationProvider`,
  `TranslateRequest`, `TranslateResult` and more) for a custom `createProvider`.
- `loadConfig({ fresh })` evaluates an edited JavaScript or TypeScript config again, and
  `configCandidatePaths` lists the files a config could come from.
