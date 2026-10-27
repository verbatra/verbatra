---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Upgrading from 0.11: rejected config, rewritten files, new exit codes and SDK type breaks.

**Config and environment**
- Node.js `^22.18.0 || >=24` is required (0.11 accepted `>=22.14.0`).
- Locale codes must be BCP 47, else `CONFIG_INVALID`: write `pt-BR` with `files.localeStyle: "posix"` for `pt_BR`, `sr-Latn` for `sr@latin`, `de` for `german`.
- An unknown key in the `provider` block, an invalid `VERBATRA_NETWORK_POLICY` and an `openai-compatible` `baseUrl` ending in `/chat/completions` fail `CONFIG_INVALID`. Move options under `provider.options`, or use the API root.
- A `--cwd` naming no directory exits 2 with `INVALID_OPTION`. Project files resolve against the found config's directory, not the working directory: a config shared by several packages needs one each, or `--config` with `--cwd`. Without `.git` the search reaches your home directory: delete a stray config there or pass `--config`.

**Files that change on the first run**
- A new `verbatra.provenance.json` records who wrote each value: commit it.
- Android, XLIFF and gettext writers keep line endings and indentation, ARB targets get `@@locale`,, and `--prune` removes ARB keys.
- An empty, missing, `new` or `needs-translation` XLIFF target is translated and billed.
- `tmx export` adds `x-origin` and `x-review` properties to segments.
- `verbatra types` declares each i18next plural base key, so `types --check` flags a 0.11 file: rerun `verbatra types`.

**Translation behavior and spend**
- A source key with an empty value is never missing, stale or up to date: `check` and `diff` exit 0 where 0.11 exited 1, and `translate` no longer pays for it.
- `humanEdits` defaults to `"protect"`: a stale key a person wrote, imported or edited is not retranslated. Use `"overwrite"` or `translate --include-human` for 0.11 behavior.
- Plural categories come from CLDR: French, Spanish, Italian and Portuguese need `many`, and Japanese, Chinese, Korean, Thai and Vietnamese no longer need `one`.
- next-intl and ARB values that kept the source's ICU arms are withheld and paid for again.
- `diff --unused` and `extract` read a plain `step_one` as a plural form of `step`: rename the key or use `extract.unused.ignore`.
- `tmx import` fails with `SOURCE_INVALID` on an unparsable source file and matches plural forms: import 0.11 units again.
- Estimates reserve 550 system-rule tokens per LLM request, not 250.
- DeepL and Google get normalized language codes (`en-US` as `EN`) and refuse a locale outside their table with `LOCALE_UNSUPPORTED_BY_PROVIDER` (exit 2). Override with `provider.options.localeMap`.
- DeepL, Google and LibreTranslate now translate and bill placeholder values 0.11 withheld, but withhold a value holding another syntax's token beside `{`, `}`, `<` or `>` (`PLACEHOLDER_UNSUPPORTED`).
- More names are placeholders (`{número}`, `{$name}`, resx `{name}`): a translation that renames one is refused. Existing values stay until their source changes.
- `requestTimeoutMs` applies per attempt, and a failure reports its cause, not `TIMEOUT`.
- Locks left by 0.11 are never reclaimed: delete them by hand once no verbatra process runs.

**CLI output and exit codes**
- New exit code 3: `translate` under `provider: none` left keys for a person.
- `init` exits 2 with `FORMAT_AMBIGUOUS` (`--yes`) or `MISSING_OPTIONS` (no terminal, or stdin ended; it exited 13), fails `CONFIG_EXISTS` on a differing config and `INIT_UNWRITABLE` through a symbolic link leaving the project.
- `export`, `tmx export` and `pseudo --out` refuse a path outside the project or onto a project file (exit 2), `types --out` must stay in the project root, and `tmx import` throws `MEMORY_UNWRITABLE` instead of the raw file-system error.
- `watch` with an unbuildable provider exits 2 with `PROVIDER_CONSTRUCTION_FAILED` at startup.
- Progress and `next:` lines go to stderr, a failed `watch` error moves from stdout to stderr, paths print relative, dry runs read `would translate`, and `pseudo` names the mode in its summary line: parse `--json`.
- A usage error prints `verbatra: error [USAGE_ERROR] <message>`: match exit code `2`.
- `doctor --json` reports `"warn"` besides `"pass"`: check `ok`.
- A bare UUID is no longer redacted, an `sk-` token of 32 or more characters is, and values under eight characters are not scrubbed.
- `verbatra mcp` exits 0 when stdin closes (it exited 13).
- Studio 0.5 and MCP 0.2 show no last run once a 0.12 run records a new review reason: upgrade them or delete `.verbatra-local/run-status.json`.

**SDK callers**
- `readGlossaryFile` and `updateGlossaryTerm` return a `Glossary`, `translation: null` removes only the shared one, and `TranslateRequest.glossary` is a `LocaleGlossary`.
- `ProviderId` gains `"none"`, `DoctorCheckStatus` `"warn"`, `SuggestionStatus` `"sensitive-withheld"`, and `ReviewReasonCode`, `SdkNoticeCode` and `onProgress` gain members: an exhaustive `switch` or `Record` breaks. `LocaleSummary.protected` and `sensitiveWithheld` are required.
- `localeValues().values` has a null prototype (use `Object.hasOwn`), `keyIntegrity` throws `UNKNOWN_KEY` for a key the source lacks, and an invalid `lockAcquireTimeoutMs` throws `LOCK_TIMEOUT_INVALID`.
- Adapter plugins: `BuildWriteTree`, `serializeEntries`, `parseEntries` and `write` take extra arguments.
- Functions given a loaded config and no `cwd` resolve paths against the config's directory, not `process.cwd()`. Pass `cwd` for the old base.
