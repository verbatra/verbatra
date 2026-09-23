---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Record which write path produced each translation in a committed `verbatra.provenance.json`.

Previously nothing recorded whether a value came from a provider, the translation memory, a
person, or a translator handoff. Every write now records it next to the lock file: `translate`
and `watch` record `machine` (with the configured provider and model), `memory`, or `fuzzy`;
`editEntry` records `human`, or `agent` when called with `actor: "agent"`; `retranslateEntry`
records `machine`; `import` records `import`. The file stores no translated text and no
timestamps, and a run that changes nothing leaves it untouched.

`check --json`, `diff --json`, `lockState`, `keyValue`, and `localeValues` now report each key's
interpreted origin, including `unrecorded` for a value with no record and `external` for a value
edited outside verbatra since it was recorded. The new `loadProvenance` reads the file itself. A
corrupt provenance file fails with `PROVENANCE_FILE_INVALID`; one from a newer verbatra is left
untouched and reported with the notice `PROVENANCE_VERSION_UNRECOGNIZED`. `types --out` and
`tmx export --out` refuse to overwrite it. The lock file itself is unchanged.
