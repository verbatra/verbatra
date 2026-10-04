---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Upgrading from 0.11: rejected config, rewritten files, new exit codes and SDK type breaks.

**Config that loaded in 0.11 and now fails with `CONFIG_INVALID`**
- Locale codes must be BCP 47. For an underscore spelling such as `pt_BR`, write `pt-BR` and set
  `files.localeStyle: "posix"`: files keep their paths, and the next `translate` carries the
  lock-file, memory and provenance state over. In `apple-xcstrings` this adds a `pt-BR` block.
- A gettext spelling such as `sr@latin` becomes `sr-Latn` with `posix` in a `gettext-po` project,
  keeping its path. A code whose script the region implies, such as `zh_Hant_TW`, becomes
  `zh-Hant-TW`, which a `gettext-po` project spells `zh_TW`: rename that file to `zh_TW`.
- A language subtag of five to eight letters (`german`) or a malformed tag is rejected: use a
  two- or three-letter language code such as `de`.
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
- i18next: `verbatra types` also declares the base key of each plural group (`cart.items` next to
  `cart.items_one`), so `types --check` reports a committed 0.11 declaration as out of date. Run
  `verbatra types` once and commit the file.

**Translation behavior and spend**
- A source key whose value is empty or whitespace only, such as one `extract` added without a
  default or a `gettext-po` source entry with an empty `msgstr`, is never missing, stale or up to
  date, even when 0.11 already translated it. `check` and `diff` exit 0 when only such keys
  differ, where 0.11 exited 1. `translate` sends nothing for them where 0.11 paid to translate an
  empty string, keeps the target value, and `export` writes no row. JSON only gains fields:
  `emptySource` on every `check` and `lockState` locale (a count) and on every `diff` and
  `translate` locale (the keys), and a `SOURCE_VALUE_EMPTY` notice on `translate`; no other field
  changes meaning. A target value such a key already has, from 0.11 or by hand, is kept until
  the source is written; the key then reports as stale, and under the default `humanEdits:
  "protect"` a value verbatra did not write stays protected until a person resolves it. Write the
  source text to translate such a key.
- `tmx import` reads the project's source locale file and fails with `SOURCE_INVALID` (exit 2)
  when that file exists but cannot be parsed. Fix the source file, then import again.
- `diff --unused` no longer counts a plain string such as `step_one` as used by `t("step")` in an
  Android, gettext or Apple catalog, where plural forms are marked: it is listed as unused and
  `diff --unused` exits 1. `extract` no longer adds `step` next to a plain `step_one` in
  i18next-json, YAML or another catalog under i18next, which it treats as a plural form. Rename
  such keys, or ignore them with `extract.unused.ignore`.
- `tmx import` takes the plural flag from the source file: a plural form whose text matches an
  imported unit is now an exact memory hit, filled without a provider call, where 0.11 sent it to
  the provider. Units imported with 0.11 stay keyed as plain strings: import the TMX file again.
  A unit matching a plural form and a plain string is stored for both and counted once.
- `humanEdits` defaults to `"protect"`: a stale key whose value a person wrote, imported or edited
  outside verbatra is no longer retranslated, and `check` keeps reporting it as stale. Set
  `humanEdits: "overwrite"`, or pass `translate --include-human` for one run, to get 0.11 behavior.
- Plural categories come from CLDR. French, Spanish, Italian and Portuguese now need `many`, and
  Japanese, Chinese, Korean, Thai and Vietnamese no longer need `one`. `generatePlurals` creates
  the extra forms, and i18next ordinals follow ordinal rules.
- For next-intl and ARB, the integrity gate checks ICU plural and select arms. A stored value that
  kept the source's arms (memory, fuzzy match, import) is withheld and paid for again. Values
  already in a locale file stay until their source changes.
- An LLM run into a language outside the well-tested list carries a `LOCALE_NOT_WELL_TESTED`
  notice. The locale is still translated.
- Estimates and token budgets reserve 550 system-rule tokens per LLM request instead of 250.
- DeepL and Google receive normalized language codes (`en-US` as `EN`, `zh-Hant` as `ZH-HANT`,
  `nb` as `no`). Override them with `provider.options.localeMap`.
- DeepL and Google translate values with placeholders that 0.11 withheld with
  `PLACEHOLDER_UNSUPPORTED`: the next run bills them and writes machine translations, flagged for
  review as usual. To keep such a key human-only, write its value by hand before the run.
- DeepL, Google and LibreTranslate also mask a token of another placeholder syntax than the
  format's (`{name}` in i18next, `{{x}}` in vue-i18n). A value holding one, which 0.11 sent as
  plain text, is now withheld with `PLACEHOLDER_UNSUPPORTED` when its other text holds `{`, `}`,
  `<` or `>`, such as ICU `{n, plural, ...}` in i18next or a comparison sign. A value with markup
  is withheld by DeepL and Google, while LibreTranslate keeps the markup and withholds it only for
  a brace; Google also withholds one with a line break, tab or double space. Translate such keys
  by hand or with an LLM provider.
- DeepL and Google: a locale missing from the shipped language table refuses the whole run with
  `LOCALE_UNSUPPORTED_BY_PROVIDER` (exit 2) before anything is spent. DeepL formality uses
  `prefer_`, so an unsupported register gives a `FORMALITY_DOWNGRADED` notice instead of failing.
- `requestTimeoutMs` applies per attempt. A failed call reports its last attempt's cause
  (`RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_ERROR`) instead of `TIMEOUT`, and Gemini
  retries a timed-out attempt.
- More single-brace names are placeholders. Names in another script (`{número}`, `{名前}`) are
  protected in `vue-i18n-json`, `properties` and `ini`, and ASCII names starting with `$`
  (`{$name}`) in `vue-i18n-json` and `ini`: a translation that renames or drops one is refused
  instead of written. In `i18next-json`, `ngx-translate-json` and `yaml`, a translation that
  invents such a token (`{$x}`, `{número}`) is refused as fabricated. Values already in a locale
  file stay until their source changes.
- In `resx`, a named hole such as `{name}` or `{when:d}` is a placeholder: a translation that
  renames it (`{name}` to `{nombre}`) is refused instead of written. A braced word in prose
  (`Click {Save}`, `{ curly }`) counts too, so keep it unchanged in the translation. Existing
  values that renamed one now show in the integrity views of Studio and the MCP server.
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
- `watch` whose provider cannot be built, such as one with an unset API key, exits 2 with
  `PROVIDER_CONSTRUCTION_FAILED` at startup instead of waiting for changes; the SDK's `watch`
  rejects the same way. Set the key before starting it.
- A `--cwd` that names no existing directory exits 2 with `INVALID_OPTION` on every command,
  before anything is read, instead of a later `CONFIG_NOT_FOUND` or `SOURCE_UNREADABLE`.
- Every command writes progress and `next:` lines to stderr (trim them with `--quiet` and
  `--no-color`). stdout keeps its text, `doctor` colors its status labels when stdout is a color
  terminal, and `--json` is unchanged.
- `doctor --json` reports `"warn"` instead of `"pass"` for a check that names something worth
  attention, and `"skipped"` for a plural-completeness check that did not run. A script that
  requires every status to be `"pass"` should also accept `"warn"`, or check `ok` instead.
- The `--json` envelope gains the optional `hint`, `causeCode`, `candidates` and `missing` fields
  and stays at version 1. New records: `lock-wait` on `import`, and `{"type":"interrupted"}`.
- `check` lists `incompletePlurals` warnings (only `check --qa --strict` exits 1 on them), and
  error messages name project files by their project-relative path.
- All CLI output is redacted. A bare UUID is no longer redacted outside a key context, an `sk-`
  token followed by 32 or more letters and digits is redacted even when it is not a key, and a
  value shorter than eight characters is no longer scrubbed by value.
- Studio 0.5 and MCP server 0.2 show no last run (an empty review queue, no usage) once a 0.12
  run records one of the new review reasons in `.verbatra-local/run-status.json`. Upgrade them
  with the CLI, or delete that file to read it with the old versions again.
- `verbatra mcp` exits 0 when the client closes stdin (it exited 13). `verbatra mcp --json` is
  refused with a stderr line only, so stdout stays clean for the client.

**SDK callers (TypeScript and JavaScript)**
- `readGlossaryFile` and `updateGlossaryTerm` return a `Glossary`, and `translation: null` removes
  only the shared translation. `TranslateRequest.glossary`, seen by a custom provider, is a
  `LocaleGlossary`.
- `ProviderId` includes `"none"`, so an exhaustive `switch` or `Record` breaks, and
  `VerbatraConfigInput` is the schema's input shape.
- `LocaleSummary.protected` and `LocaleSummary.sensitiveWithheld` are new required fields, and
  `SuggestionStatus` gains `"sensitive-withheld"`. `RunBudget.supported` is `true` for a run
  that sent no request, and `import`'s `unchanged` leaves out keys the handoff accepted or refused.
- `DoctorCheckStatus` gains `"warn"`: a check that names something worth attention without
  failing, such as a plural missing a CLDR category or a non-canonical locale code, reports
  `warn` instead of `pass`, in `doctor --json` too, and `doctor` prints it as `[warn]`. `ok` and
  the exit code do not change. Handle `"warn"` in an exhaustive `switch` or `Record`.
- `localeValues().values` has a null prototype (use `Object.hasOwn`), and `scaffoldingMetadata` is
  deep-frozen.
- `onProgress` has new event kinds, `ReviewReasonCode` gains `GLOSSARY_FORBIDDEN_TERM`,
  `FOREIGN_PLACEHOLDER_CHANGED` and `BIDI_CONTROLS_CHANGED`, and `SdkNoticeCode` gains codes
  such as `SOURCE_FOREIGN_PLACEHOLDERS`, `LOCALE_STATE_CARRIED_OVER` and the `SENSITIVE_CONTENT_*`
  notices, so an exhaustive `switch` or `Record` breaks. An invalid `lockAcquireTimeoutMs` throws
  `LOCK_TIMEOUT_INVALID` instead of being accepted.
- Adapter plugins: `BuildWriteTree` gets a fourth argument, `serializeEntries` a fifth (the
  locale), `parseEntries` receives the locale, and `write` takes a `WriteContext`. A throw from a
  `custom:` parser is `ADAPTER_FAILED` with the original error as `cause`, and a malformed
  `parseEntries` result fails the read.
- `SOURCE_INVALID` and `PROVIDER_CONSTRUCTION_FAILED` carry the wrapped error as `cause`.
