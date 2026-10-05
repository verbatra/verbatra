---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Provenance for every translation, protected human edits, and a human-only `provider: none`.

**Provenance**
- Every write records its origin in a committed `verbatra.provenance.json`: `machine` (with
  provider and model), `memory`, `fuzzy`, `human`, `agent`, `import`, or `unknown` for a value
  that had no record before. It holds no text.
- `check --json`, `diff --json`, `lockState`, `keyValue` and `localeValues` report each key's
  origin, including `unrecorded` and `external` (edited outside verbatra). `loadProvenance` reads
  the file. A corrupt file fails writes with `PROVENANCE_FILE_INVALID`.
- XLIFF exports mark unreviewed machine text. `tmx export` tags every target segment with
  `x-origin` (`machine`, `human`, `import` or `unknown`) and a machine one with `x-review`; its
  result's `provenanceMarkers` is `unavailable` when the provenance or lock file cannot be read.
  Imports ignore the markers.
- `verbatra report provenance` (SDK: `provenanceReport`) counts each locale's values by origin and
  review state, and lists every key with `--json`. It is read-only and keyless.

**Human translations are protected**
- A stale key whose value a person wrote, imported or changed outside verbatra is kept
  (`humanEdits: "protect"`, the default) and listed in `LocaleSummary.protected`. `"suggest"`
  returns the provider's answer as `ProtectedKey.suggestion` without writing it, and
  `"overwrite"` or `translate --include-human` retranslates it.
- `pinnedKeys` (patterns with `*`) are never machine-translated. `retranslateEntry` refuses a
  protected value with `KEY_PROTECTED` unless `includeHuman` is set, and a pinned key with
  `KEY_PINNED`. `translate`, `check` and `diff` count protected keys.

**Human-only mode**
- `provider: { id: "none" }` disables machine translation: no provider is built and no key is
  read. Runs fill only exact translation-memory hits and list the rest in `LocaleSummary.unfilled`.
  `retranslateEntry` fails with `MACHINE_TRANSLATION_DISABLED`.
- `init --provider none` scaffolds it, `translate` exits 3 when keys are left for a person, and
  the next steps point at `verbatra export` and Studio. SDK: `isMachineTranslationEnabled`,
  `assertMachineTranslationEnabled`.
