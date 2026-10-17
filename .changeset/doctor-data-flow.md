---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

`verbatra doctor --data-flow` prints a versioned manifest of what goes where, for a DPA or NDA review.

**What it reports**
- The provider, every host its requests go to (with where the host comes from, any proxy, and the
  network policy's verdict), the kinds of data this config sends, the code each target locale is
  sent as with its glossary term count, and source key, context and withheld counts.
- The files written locally with their project-relative paths, whether they hold source text,
  translations or personal data, and whether `verbatra init` gitignores them, plus `doctor --live`,
  DNS lookups and the agent surfaces.
- Provider `none` reports that nothing is sent.

**How to use it**
- `verbatra doctor --data-flow --json` puts the manifest under `result.dataFlow`; it reads no API
  key and makes no network request, and exits `0` whenever the config loads.
- `--data-flow` cannot be combined with `--literals`, `--locales` or `--live` (`INVALID_OPTION`).
- The SDK exports `dataFlow()`, `doctor({ dataFlow: true })` and `dataFlowManifestSchema` to
  validate a manifest; unknown fields are allowed, so newer fields can be ignored.
