---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Provenance, protected human edits, a review queue and gate, glossary v2, and a human-only `provider: none`.

**Provenance and review**
- Every write records its origin (`machine`, `memory`, `fuzzy`, `human`, `agent`, `import`) in a committed `verbatra.provenance.json`. `check`, `diff` and `lockState` report it, and `verbatra report provenance` counts values by origin.
- A stale key a person wrote, imported or edited outside verbatra is kept (`humanEdits: "protect"`, the default; `"suggest"`, `"overwrite"` and `translate --include-human` change that). `pinnedKeys` are never machine-translated.
- `reviewQueue` lists every machine-written value nobody approved, from committed files. `approveEntry`, `rejectEntry` and `approveLocale` record decisions, and an edit drops an approval.
- `verbatra check --require-reviewed` exits 1 while any machine-written value is unapproved, keyless.

**Glossary and human-only mode**
- Glossary `{ "version": 2, "terms", "doNotTranslate" }` takes per-locale `targets`, `forbidden` renderings, `caseSensitive`, `note` and `partOfSpeech`. Version 1 files keep working.
- `provider: { id: "none" }` builds no provider and reads no key. Runs fill only memory hits, and `translate` exits 3 when keys are left for a person.
