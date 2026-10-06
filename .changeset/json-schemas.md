---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

JSON Schemas for every `--json` record and the config, in the packages and at stable URLs.

**Schemas**
- Every envelope `--json` prints, the error envelope, each command's `result` and the JSON lines on
  stderr (progress, lock wait, interrupt) have a draft 2020-12 JSON Schema. They allow fields they
  do not list, so a newer verbatra still validates.
- `@verbatra/cli/schemas/<command>-envelope.json`, `envelope.json`, `error-envelope.json`,
  `init-result.json` and `stderr-record.json`; `@verbatra/sdk/schemas/<result>.json` and
  `config.json`. `@verbatra/sdk/config-schema.json` keeps working.
- The same documents are served at `https://verbatra.kreitz-webdev.de/schema/v1/<name>.json`, with
  an index at `/schema/v1`. Point a `.verbatrarc.json` `$schema` at `.../schema/v1/config.json` to
  validate it in an editor without a local install.

**SDK exports**
- A zod 4 schema per result, such as `runSummarySchema`, `checkSummarySchema` and
  `doctorResultSchema`, plus `progressEventSchema`, `lockWaitEventSchema`, `localeSummarySchema`,
  `keyProvenanceSchema`, `provenanceSummarySchema` and `keyOriginSchema`. Their `parse` strips
  fields they do not list.
- `renderJsonSchemas`, `jsonSchemaUrl`, `SDK_JSON_SCHEMAS` and `JSON_SCHEMA_BASE_URL` turn them
  into the published documents; `renderOutputJsonSchema` renders one schema of your own the same
  way, without verbatra's `$id`.
- `KNOWN_ERROR_CODES` lists every SDK, provider and adapter error code. The error envelope schema
  offers them, with the CLI's codes, as an editor hint and still accepts any code.
