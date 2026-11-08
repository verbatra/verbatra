---
"@verbatra/sdk": minor
"@verbatra/mcp": patch
---

Set per-key length limits in `verbatra.limits.json`, next to the lock file, with `setKeyLengthLimit`, in addition to the config's `maxLength`.

- **What you get:** `setKeyLengthLimit({ config, key, maxLength })` sets, changes or removes (`null`) one key's limit in `verbatra.limits.json`, a committed file of the form `{ "version": 1, "maxLength": { "<key>": 18 } }`. Every place that held a value to a `maxLength` budget reads it: `translate`, `watch`, `retranslateEntry`, `check --qa`, `checkFile`, `exportWorkbook` and `keyContext`. A limit stays advisory: a longer value is written and flagged `MAX_LENGTH_EXCEEDED`, never refused.
- **The config wins:** for a key set in both, the config's `maxLength` applies, and `setKeyLengthLimit` refuses a limit for a key the config sets (`LENGTH_LIMIT_INVALID`); `null` still removes the file's own entry for it. `keyContext` and `key.context` return `maxLengthSource` (`config` or `limits-file`) beside `maxLength`.
- **What it refuses:** the key must be in the source (`UNKNOWN_KEY`), except that `null` removes the entry of a key that has left it, also while the source cannot be read. The limit is a whole number from 1 to 9007199254740991 and the key 1 to 1024 characters. The file holds at most 10,000 entries and 1 MiB, checked before anything is written (`LIMITS_FILE_UNUSABLE`).
- **A file it cannot use:** a run never fails on it. `translate` and `watch` raise `LIMITS_FILE_IGNORED` on every locale and hold values to the config's budgets only; `keyContext` and `key.context` return a `limitsNotice`; `verbatra doctor` has a new `limits` check that warns on an unusable file, a limit for a key the source no longer has and a limit the config overrides. `setKeyLengthLimit` never overwrites a file it cannot read.
- **Writes are safe to overlap:** the read-modify-write holds its own lock, so two processes setting different keys at once lose no update, and the file is replaced atomically, sorted, with a final newline.
- **Data flow:** `verbatra doctor --data-flow` lists the file as `limits`: no source text, no translations, no personal data, not gitignored. The manifest stays at version 1.
- **Fixed:** `keyContext` reported a function (or, for `__proto__`, an object) as `maxLength` for a key named like an object property, such as `constructor` or `toString`, when the config had a `maxLength` map without that key. Such a key now has no limit unless one is set for it.
- **Changed:** `checkFile` and `verbatra check --file` now also read `verbatra.limits.json`, and `doctor` has one more check id, `limits`, before `locales`. A tool that lists every check id or every data-flow file id should add it.
