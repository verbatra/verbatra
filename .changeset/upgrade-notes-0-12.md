---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Upgrading from 0.11: config that now fails to load, files rewritten on the first run, new exit
codes, changed result shapes, and SDK type breaks.

**Config that loaded in 0.11 and now fails with `CONFIG_INVALID`**
- Locale codes must be BCP 47. An underscore spelling (`pt_BR`), a gettext spelling (`sr@latin`),
  a language subtag of five to eight letters (`german`) and malformed tags are rejected. Write
  `pt-BR` (or `sr-Latn` in a `gettext-po` project) and set `files.localeStyle: "posix"`: the files
  keep their paths, and the next `translate` carries the lock-file, translation-memory and
  provenance state over to the new code. In `apple-xcstrings`, the new code adds a `pt-BR` block.
- Unknown keys in the `provider` block beside `id` and `options`, such as a misplaced `localeMap`,
  are rejected. Move a provider option under `provider.options`, or remove the key.
- An invalid `VERBATRA_NETWORK_POLICY` or `VERBATRA_NETWORK_ALLOWED_HOSTS` value fails
  `translate`, dry runs and estimates included.

**Files that change on the first 0.12 run**
- A new `verbatra.provenance.json` next to the lock file records who wrote each value. Commit it.
  A corrupt one fails every write with `PROVENANCE_FILE_INVALID`.
- Android, XLIFF and gettext writers keep the file's line endings and indentation, and a created
  `.po` file gets a `Language` header, so the first write may produce a whitespace-only diff.
- ARB target files get `@@locale` first, and `translate --prune` now removes ARB keys.
- XLIFF: an empty, missing, `state="new"` or `state="needs-translation"` target counts as missing
  and is translated, and billed, on the next run. A value containing entities may show as changed
  once. A unit missing from the target document is appended. A segment in state `initial` that
  verbatra writes becomes `translated`.
- No empty target file is created for a new locale whose keys were all withheld, and `import`
  writes new keys in source order.

**Translation behavior and spend**
- `humanEdits` defaults to `"protect"`: a stale key whose value a person wrote, imported or edited
  outside verbatra is no longer retranslated, and `check` keeps reporting it as stale. Set
  `humanEdits: "overwrite"`, or pass `translate --include-human` for one run, to get 0.11 behavior.
- Plural categories come from CLDR. French, Spanish, Italian and Portuguese now need `many`, and
  Japanese, Chinese, Korean, Thai and Vietnamese no longer need `one`. `generatePlurals` creates
  the extra forms, and i18next ordinals follow ordinal rules.
- The integrity gate checks ICU plural and select arms. A stored value that kept the source's arms
  (translation memory, fuzzy match, import) is withheld and its key is paid for again.
- Estimates and token budgets reserve 550 system-rule tokens per LLM request instead of 250.
- DeepL and Google receive normalized language codes (`en-US` as `EN`, `zh-Hant` as `ZH-HANT`,
  `nb` as `no`). Override them with `provider.options.localeMap`.
- DeepL and Google: a locale missing from the shipped language table refuses the whole run with
  `LOCALE_UNSUPPORTED_BY_PROVIDER` (exit 2) before anything is spent. DeepL formality uses
  `prefer_`, so an unsupported register gives a `FORMALITY_DOWNGRADED` notice instead of failing.
- `requestTimeoutMs` applies per attempt. A failed call reports its last attempt's cause
  (`RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_ERROR`) instead of `TIMEOUT`, and Gemini
  retries a timed-out attempt.
- Integrity refusals report `empty` and `icu` ahead of `placeholder` and `markup`.
  `LENGTH_RATIO_OUTLIER` counts graphemes weighted by script.
- `lockAcquireTimeoutMs` bounds only the waits before a provider call, and `onLockWait` first
  fires after one second. Locks left by 0.11 or by another machine are never reclaimed
  automatically: delete them by hand once no verbatra process runs.

**CLI output and exit codes**
- New exit code 3: `translate` under `provider: none` left keys for a person.
- `init`: `--yes` with an ambiguous format exits 2 with `FORMAT_AMBIGUOUS` (pass `--format`), a
  non-interactive run without `--yes` fails with `MISSING_OPTIONS`, and a differing
  `verbatra.config.ts` fails with `CONFIG_EXISTS` instead of being skipped with exit 0. An existing
  `.env.example` is appended to.
- `export` and `tmx export` refuse an output path outside the project or onto a project file, and
  `pseudo --out` checks its path again after resolving symbolic links. Failed writes are
  structured. All exit 2: `EXPORT_OUTPUT_CONFLICT`, `EXPORT_UNWRITABLE`, `TMX_OUTPUT_CONFLICT`,
  `TMX_UNWRITABLE`, `PSEUDO_OUTPUT_CONFLICT`.
- A failed `watch` run's error line moves from stdout to stderr, human output prints paths
  relative to the working directory, and dry runs read `would translate`.
- Every command writes progress lines to stderr, with a spinner and color on a terminal, and an
  error line is followed by a `next:` line. stdout and `--json` are unchanged. Use `--quiet` and
  `--no-color` to trim stderr.
- The `--json` envelope gains the optional `hint`, `causeCode`, `candidates` and `missing` fields
  and stays at version 1. New records: `lock-wait` on `import`, and `{"type":"interrupted"}`.
- `check` lists `incompletePlurals` warnings (only `check --qa --strict` exits 1 on them), and
  error messages name project files by their project-relative path.
- All CLI output is redacted. A bare UUID is no longer redacted outside a key context, an `sk-`
  token followed by 32 or more letters and digits is redacted even when it is not a key, and a
  value shorter than eight characters is no longer scrubbed by value.
- `verbatra mcp` exits 0 when the client closes stdin (it exited 13). `verbatra mcp --json` is
  refused with a stderr line only, so stdout stays clean for the client.

**SDK callers (TypeScript and JavaScript)**
- `readGlossaryFile` and `updateGlossaryTerm` return a `Glossary`, and `translation: null` removes
  only the shared translation. `TranslateRequest.glossary`, seen by a custom provider, is a
  `LocaleGlossary`.
- `ProviderId` includes `"none"`, so an exhaustive `switch` or `Record` breaks.
  `VerbatraConfigInput` is the schema's input shape.
- `LocaleSummary.protected` is a new required field. `RunBudget.supported` is `true` for a run
  that sent no request, and `import`'s `unchanged` leaves out keys the handoff accepted or refused.
- `localeValues().values` has a null prototype (use `Object.hasOwn`), and `scaffoldingMetadata` is
  deep-frozen.
- `onProgress` has new event kinds, so an exhaustive `switch` breaks.
- An invalid `lockAcquireTimeoutMs` throws `LOCK_TIMEOUT_INVALID` instead of being accepted.
- Adapter plugins: `BuildWriteTree` gets a fourth argument, `serializeEntries` a fifth (the
  locale), `parseEntries` receives the locale, and `write` takes a `WriteContext`. A throw from a
  `custom:` parser is `ADAPTER_FAILED` with the original error as `cause`, and a malformed
  `parseEntries` result fails the read.
- `SOURCE_INVALID` and `PROVIDER_CONSTRUCTION_FAILED` carry the wrapped error as `cause`.
