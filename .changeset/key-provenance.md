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
edited outside verbatra since it was recorded; they leave those fields out, rather than fail, when
the file is corrupt or from a newer verbatra. The new `loadProvenance` reads the file itself.

A write fails with `PROVENANCE_FILE_INVALID` before touching anything when the file is corrupt. A
file from a newer verbatra is left untouched: `translate`, `watch`, and `import` report the notice
`PROVENANCE_VERSION_UNRECOGNIZED`, and a single-key edit records nothing. A write that would grow
the file past the size verbatra reads back keeps the previous file: `translate`, `watch`, and
`import` report `PROVENANCE_FILE_TOO_LARGE`, and a single-key edit records nothing. `types --out` and `tmx export --out` refuse to overwrite the file. The
lock file itself is unchanged.
