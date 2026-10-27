---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

XLIFF 1.2 and 2.0 handoff, JSON Schemas for every `--json` record and the config, a CommonJS entry, and new SDK exports.

**Handoff and schemas**
- `verbatra export --format xliff2` (or `xliff12`) writes one `<locale>.xlf` per target locale for any project format, with placeholders, markup and ICU as protected inline codes. `verbatra import` reads either version through the integrity gate and takes the handoff format from the extension.
- Every `--json` envelope, each `result` and the config have a draft 2020-12 JSON Schema that allows unlisted fields. They ship as `@verbatra/cli/schemas/*` and `@verbatra/sdk/schemas/*` and are served at `https://verbatra.kreitz-webdev.de/schema/v1/<name>.json`; point `$schema` at `.../schema/v1/config.json` for editor checks.

**Packaging and SDK**
- A `verbatra.config.cjs` can `require("@verbatra/cli")`, `@verbatra/sdk` ships `index.d.cts`, and every package exports `./package.json`.
- The SDK exports a zod 4 schema per result, the provider contract types for a custom `createProvider`, and read helpers such as `keyContext` and `localeValuesPage`.
- `translate` and `retranslateEntry` take a `signal`: finished batches stay written, unsent keys stay pending, locks are released (`RUN_CANCELLED`).
