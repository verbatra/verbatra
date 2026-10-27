---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Upgrading from 0.11: rejected config, rewritten files, new exit codes and SDK type breaks.

**Config and environment**
- Node.js `^22.18.0 || >=24` is required (0.11 accepted `>=22.14.0`).
- Locale codes must be BCP 47, else `CONFIG_INVALID`: write `pt-BR` with `files.localeStyle: "posix"` for `pt_BR`, `sr-Latn` (with `posix` in a `gettext-po` project) for `sr@latin`, `zh-Hant-TW` for `zh_Hant_TW` (a `gettext-po` project spells its file `zh_TW`: rename it), `de` for `german`.
- An unknown key in the `provider` block and an `openai-compatible` `baseUrl` ending in `/chat/completions` fail `CONFIG_INVALID`: move options under `provider.options`, or use the API root. An invalid `VERBATRA_NETWORK_POLICY` or `VERBATRA_NETWORK_ALLOWED_HOSTS` value fails `translate` (dry runs and estimates included), `retranslateEntry` and `watch` startup with `CONFIG_INVALID`; provider `none` skips the check.
- An `openai-compatible` `apiKeyEnvVar` naming `OPENCODE_API_KEY` (0.11 accepted it for OpenCode Zen) fails `CONFIG_INVALID`, as any hosted provider's key variable does, so a hosted key never reaches an arbitrary `baseUrl`: use `provider: { id: "opencode", options: { model, maxOutputTokens } }`, which reads `OPENCODE_API_KEY` itself and needs no `baseUrl`.
- A `--cwd` naming no directory exits 2 with `INVALID_OPTION`. Project files resolve against the found config's directory, not the working directory: a config shared by several packages needs one each, or `--config` with `--cwd`. Without `.git` the search reaches your home directory: delete a stray config there or pass `--config`.

**Files that change on the first run**
- A new `verbatra.provenance.json` records who wrote each value: commit it. A corrupt one fails writes with `PROVENANCE_FILE_INVALID`.
- Android, XLIFF and gettext writers keep line endings and indentation (the first write may show a whitespace-only diff), ARB targets get `@@locale`, and `translate --prune` removes ARB keys.
- No empty target file is created for a locale whose keys were all withheld, and `import` writes new keys in source order.
- An empty, missing, `new` or `needs-translation` XLIFF target is translated and billed.
- `tmx export` adds `x-origin` and `x-review` properties to segments.
- `verbatra types` declares each i18next plural base key, so `types --check` flags a 0.11 file: rerun `verbatra types`.

**Translation behavior and spend**
- A source key with an empty value is never missing, stale or up to date: `check` and `diff` exit 0 where 0.11 exited 1, and `translate` no longer pays for it.
- `humanEdits` defaults to `"protect"`: a stale key a person wrote, imported or edited is not retranslated. Use `"overwrite"` or `translate --include-human` for 0.11 behavior.
- Plural categories come from CLDR: French, Spanish, Italian and Portuguese need `many`, and Japanese, Chinese, Korean, Thai and Vietnamese no longer need `one`.
- next-intl and ARB values that kept the source's ICU arms are withheld and paid for again.
- In Android, gettext and Apple catalogs `diff --unused` no longer counts a plain `step_one` as used by `t("step")` (it exits 1), and under i18next `extract` no longer adds `step` next to it: rename the key or use `extract.unused.ignore`.
- `tmx import` fails with `SOURCE_INVALID` on an unparsable source file and matches plural forms: import 0.11 units again.
- Estimates reserve 550 system-rule tokens per LLM request, not 250.
- DeepL and Google get normalized language codes (`en-US` as `EN`) and refuse a locale outside their table with `LOCALE_UNSUPPORTED_BY_PROVIDER` (exit 2). Override with `provider.options.localeMap`.
- DeepL and Google now translate and bill placeholder values 0.11 withheld with `PLACEHOLDER_UNSUPPORTED`: to keep a key human-only, write its value by hand. They also withhold a value holding another syntax's token beside `{`, `}`, `<` or `>`.
- More names are placeholders (`{número}`, `{$name}`, resx `{name}`): a translation that renames one is refused. Existing values stay until their source changes.
- `requestTimeoutMs` applies to each attempt, not the whole retried call; after retries a failure reports the last attempt's cause (`RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_ERROR`, or `TIMEOUT`), and Gemini retries a timed-out attempt.
- `LENGTH_RATIO_OUTLIER` measures weighted graphemes (Han 3.5, kana 1.5, Hangul 2), so correct CJK translations stop being flagged as too short; some values flag differently, for example a CJK source into a Latin target.
- `openai-compatible` requests send `User-Agent: verbatra` instead of the OpenAI SDK default: update proxy rules keyed on it.
- Locks left by 0.11 or by another machine are never reclaimed: delete them by hand once no verbatra process runs.

**CLI output and exit codes**
- New exit code 3: `translate` under `provider: none` left keys for a person.
- `init` exits 2 with `FORMAT_AMBIGUOUS` (`--yes`) or `MISSING_OPTIONS` (no terminal, or stdin ended; it exited 13), fails `CONFIG_EXISTS` on a differing config and `INIT_UNWRITABLE` through a symbolic link leaving the project.
- `export` and `tmx export` refuse a path outside the project or onto a project file (new `EXPORT_OUTPUT_CONFLICT`, `TMX_OUTPUT_CONFLICT`, exit 2); `pseudo --out` (`PSEUDO_OUTPUT_CONFLICT`) now also refuses a symlink leaving the project and a project file; `types --out` must stay in the project root; `tmx import` throws `MEMORY_UNWRITABLE` instead of the raw file-system error.
- `watch` with an unbuildable provider exits 2 with `PROVIDER_CONSTRUCTION_FAILED` at startup.
- Progress and `next:` lines go to stderr, a failed `watch` error moves from stdout to stderr, paths print relative, dry runs read `would translate`, and `pseudo` names the mode in its summary line: parse `--json`.
- A usage error prints `verbatra: error [USAGE_ERROR] <message>` instead of commander's `error: <message>`: match exit code `2` or the code.
- `--json` stays version 1 and gains optional `hint`, `causeCode`, `candidates` and `missing` fields, plus `lock-wait` and `interrupted` stream records.
- `doctor --json` reports `"warn"` besides `"pass"` (and `"skipped"` for plural-completeness): check `ok` rather than requiring every `pass`.
- A bare UUID is no longer redacted, an `sk-` token of 32 or more characters is, and values under eight characters are not scrubbed.
- `verbatra mcp` exits 0 when stdin closes (it exited 13).
- Studio 0.5 and MCP 0.2 show no last run once a 0.12 run records a new review reason: upgrade them or delete `.verbatra-local/run-status.json`.

**SDK callers**
- `readGlossaryFile` and `updateGlossaryTerm` return a `Glossary`, `translation: null` removes only the shared one, and `TranslateRequest.glossary` is a `LocaleGlossary`.
- `ProviderId` gains `"none"` and `"opencode"` (`MachineProviderId` gains `"opencode"`), `DoctorCheckStatus` `"warn"`, `SuggestionStatus` `"sensitive-withheld"`, `ReviewReasonCode` `GLOSSARY_FORBIDDEN_TERM`, `FOREIGN_PLACEHOLDER_CHANGED` and `BIDI_CONTROLS_CHANGED`, and `SdkNoticeCode` and `onProgress` more members: an exhaustive `switch` or `Record` breaks. `LocaleSummary.protected` and `sensitiveWithheld` are required.
- `localeValues().values` has a null prototype (use `Object.hasOwn`), `keyIntegrity` throws `UNKNOWN_KEY` for a key the source lacks, and an invalid `lockAcquireTimeoutMs` throws `LOCK_TIMEOUT_INVALID`.
- `VerbatraConfigInput` is the schema's input shape. `RunBudget.supported` is `true` for a run that sent no request, and `import`'s `unchanged` leaves out keys the handoff accepted or refused.
- Adapter plugins: `BuildWriteTree` takes the locale as a 4th argument, `serializeEntries` a `WriteContext` and the locale (4th, 5th), `parseEntries` the locale, and `write` an optional `WriteContext`. A `custom:` parser throw is `ADAPTER_FAILED` with the original as `cause` (0.11: `INVALID_STRUCTURE`, no cause), and a malformed `parseEntries` result fails the read.
- Functions given a loaded config and no `cwd` resolve paths against the config's directory, not `process.cwd()`. Pass `cwd` for the old base.
