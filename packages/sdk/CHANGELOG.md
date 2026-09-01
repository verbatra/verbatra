# @verbatra/sdk

## 0.10.0

### Minor Changes

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `android-xml`, a new supported format, for Android's `res/values/strings.xml`
  and `res/values-<qualifier>/strings.xml` resource files. Plurals are read and
  written as separate entries per quantity (`zero`, `one`, `two`, `few`, `many`,
  `other`), and printf-style placeholders (`%s`, `%1$s`) are guarded across
  translation. Entries marked `translatable="false"`, `<string-array>` elements, and
  strings containing inline markup are left untouched. Writes preserve existing file
  structure and create missing destination directories.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `apple-strings`, a new supported format, for Apple's `.strings` localization
  files (flat `"key" = "value";` pairs) and their sibling `.stringsdict` plural
  files, both addressed through the same format id. Printf-style placeholders
  (`%@`, `%d`, `%1$@`) are guarded across translation, and CLDR plural categories
  round-trip as separate entries with no fabricated or dropped categories. A
  UTF-16 `.strings` file is rejected with a clear error instead of being parsed
  into corrupt data. Writes preserve existing key order, comments, and
  non-translatable `.stringsdict` structure, creating missing `.lproj` directories
  as needed.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `apple-xcstrings`, a new supported format, for Apple's Xcode String Catalog
  (`.xcstrings`) files, which hold every locale in one JSON document rather than
  one file per locale. Plural categories and printf placeholders are handled the
  same way as the `apple-strings` format. Because all locales share one physical
  file, writes to an `apple-xcstrings` catalogue are serialized, so concurrency
  above 1 no longer parallelizes operations for this format specifically. Writes
  patch only the touched localizations, leaving everything else in the document
  untouched.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `gettext-po`, a new supported format, for GNU gettext `.po` and `.pot`
  catalogs. `msgid`/`msgstr` pairs become entries, `msgctxt` disambiguates entries
  sharing a `msgid`, and plural forms round-trip as separate entries keyed by
  their `msgstr[n]` index. Comments, references, flags, and the header block are
  preserved on write. Printf-style (`%s`, `%d`, `%1$s`) and Python-style
  (`%(name)s`) placeholders are guarded across translation. Known limitation: a
  plural form present only in a target locale cannot always be distinguished from
  a removed key, which only matters when `--prune` is enabled.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `google-translate`, a new translation provider, for Google Cloud Translation
  Basic (v2). Like DeepL, it is a machine-translation API rather than a language
  model, with no tone control and no glossary support in v1; it reads
  `GOOGLE_TRANSLATE_API_KEY` from the environment. Entries containing
  placeholders or ICU syntax are withheld and reported rather than sent to the
  API. Registered end to end: the provider factory table, config schema,
  `verbatra init` scaffolding, and the CLI `--provider` option.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Add `@verbatra/mcp`, a new stdio MCP server exposing verbatra's translation
  status, glossary, and editing capabilities as tools for MCP clients such as
  Claude Desktop, Claude Code, and Cursor. Ships 13 tools covering status checks,
  glossary editing, key integrity, and translation editing; the two tools that
  call a provider and spend API usage are only advertised when the server is
  started with spending allowed. Ships both a library export (`startMcpServer`)
  and a `verbatra-mcp` binary, versioned and published independently of
  `@verbatra/sdk`/`@verbatra/cli`. `@verbatra/cli` gains a new `mcp` command that
  loads it via dynamic import, so a missing `@verbatra/mcp` install never breaks
  the rest of the CLI. `@verbatra/sdk` also gains a shared `redact` utility, used
  to strip provider API key values out of tool output before it reaches a caller.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - `@verbatra/sdk` adds `localeValues`, a bulk read returning every key's current
  source and target text across requested locales in one pass, without needing
  to fetch each key individually through `keyValue`. It backs client-side content
  search over translation values, not just key names. Read-only: it writes
  nothing and calls no provider.

### Patch Changes

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Bump bundled runtime dependencies (`@anthropic-ai/sdk`, `@google/genai`, `openai`, `@formatjs/icu-messageformat-parser`, `@xmldom/xmldom`, `zod`) to their latest releases; no behavior change observed.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix config validation to reject a target locale that case-insensitively matches the source locale (for example `sourceLocale: "de"` with `targetLocales: ["DE"]`), preventing the source locale file from being silently overwritten on case-insensitive file systems.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix a polynomial-time regular expression denial-of-service in the printf-style and gettext placeholder extraction used by the Android `strings.xml`, Apple `.strings`/`.stringsdict`, and gettext `.po`/`.pot` adapters. The flags and field-width parts of the specifier pattern both matched a leading `0`, so a translatable string starting with `%` followed by many `0` characters made the regex engine try every possible split between the two before failing, taking quadratic time. The field-width alternative now requires a leading nonzero digit, which any legitimate width already has once the flag characters (including `0` padding) are accounted for, so previously matched placeholders are extracted identically while the ambiguous split is eliminated.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Remove the unused `PlaceholderFinding` type from `@verbatra/core`, which had no
  internal consumers and was never present in the published sdk type declarations.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix workbook import silently accepting a sheet whose middle header columns
  (Source, Current translation, Status, Translation) were reordered or
  relabeled, since only Key and Source hash were validated while data was mapped
  by column index. The header check now validates all six columns, rejecting a
  mismatched header with a structural error.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix `importWorkbook` reporting a spurious missing-sheet failure for target
  locales not covered by a single-file delimited import; it now only checks the
  one locale that file targets. Fix `exportWorkbook` failing to create a
  not-yet-existing nested output directory for an `.xlsx` handoff, matching the
  delimited export branch's existing behavior.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix the XLIFF adapter's destination-read error message incorrectly claiming a
  file does not exist for non-ENOENT failures (permission denied, a directory in
  place of a file); both cases still raise the same structured error. Also
  deduplicates line-terminator detection helpers shared across the properties,
  Apple `.strings`, and gettext adapters, with no behavior change.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Bound the recursion depth when serializing translated XLIFF inline markup (`<g>`, `<x>`, and similar elements), matching the depth limit already enforced for JSON and YAML trees. Adversarially deep nested elements in translated content now raise a structured `AdapterError` instead of silently degrading to escaped plain text after an internal, previously-swallowed stack overflow.

- [#206](https://github.com/verbatra/verbatra/pull/206) [`e96100e`](https://github.com/verbatra/verbatra/commit/e96100eadbea0b1865a88be96bc29b3479b133d8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Extend the existing CSV/TSV formula-injection guard to the xlsx export path. Source, current-translation, translation, and context values that begin with a formula-triggering character are now apostrophe-escaped before being written to the workbook, and unescaped again on import, so a translatable string can no longer become a live formula when a reviewer opens the exported spreadsheet.

## 0.9.3

### Patch Changes

- [#195](https://github.com/verbatra/verbatra/pull/195) [`ab85607`](https://github.com/verbatra/verbatra/commit/ab85607f24c4edcedea8e4d2267e25ee79f0070a) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix `verbatra.config.ts` resolving the wrong `@verbatra/sdk` or `@verbatra/cli` when a config
  file does `import { defineConfig } from "@verbatra/cli"` (or from `@verbatra/sdk`) and a
  different, conflicting install of either package is also reachable from the config file's own
  location. `loadConfig` transpiles `.ts` config files through jiti (via
  `cosmiconfig-typescript-loader`), which resolves bare specifiers itself, bypassing Node's own
  module resolution.
  
  `loadConfig` now passes jiti an alias that points `@verbatra/sdk` and `@verbatra/cli` at the
  exact packages installed alongside the SDK build that is actually running, resolved from the
  running code's own location rather than from the config file's location. A config file's import
  now consistently resolves to the pinned SDK and CLI in effect, even when an unrelated, differently
  versioned copy of either package also happens to be installed near the config file. A package that
  is not installed anywhere reachable from the running SDK is left unaliased, so the import falls
  back to jiti's ordinary bare-specifier resolution from the config file's own location, exactly as
  before this fix, instead of resolving to the wrong version silently.

## 0.9.2

### Patch Changes

- [#193](https://github.com/verbatra/verbatra/pull/193) [`6f56c63`](https://github.com/verbatra/verbatra/commit/6f56c63f13705dc47031be3c1044c96f8fc9736d) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix config discovery so it actually searches upward from the working directory, as the README,
  SDK README, and docs site already documented. `loadConfig` previously left cosmiconfig's
  `searchStrategy` unset, which defaults to `none` (current directory only), so running verbatra
  from a nested monorepo package directory raised `CONFIG_NOT_FOUND` instead of finding the config
  at the repository root.
  
  The search now walks upward and stops at the nearest ancestor directory containing a `.git` entry
  (or the user's home directory if none is found), so it finds a monorepo-root config without
  wandering into an unrelated project above the repository.

- [#193](https://github.com/verbatra/verbatra/pull/193) [`6f56c63`](https://github.com/verbatra/verbatra/commit/6f56c63f13705dc47031be3c1044c96f8fc9736d) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Fix a broken transitive type dependency leaking through the published `@verbatra/sdk` `.d.ts`.
  The Gemini authoring model type was re-exported from `@google/genai`'s own `Interactions.Model`,
  but every entry point of that package's type declarations carries an unconditional top-level
  import of `@modelcontextprotocol/sdk/client/index.js`, an optional peer dependency it does not
  install. A consumer running `tsc --noEmit` with `skipLibCheck: false` got `TS2307: Cannot find
  module '@modelcontextprotocol/sdk/client/index.js'` from deep inside `@google/genai`'s own types,
  with no fix available on their side short of installing an unrelated MCP SDK package.
  
  `GeminiModel` is now a hand-maintained string literal union (still open-ended via `string & {}`,
  so unknown or newly released model IDs are still accepted), breaking the transitive dependency
  entirely while preserving editor autocomplete for known Gemini model IDs in `defineConfig`.

## 0.9.1

### Patch Changes

- [#185](https://github.com/verbatra/verbatra/pull/185) [`8dcf89d`](https://github.com/verbatra/verbatra/commit/8dcf89dc82e7716ec3d1b2bc5d8c8cff43974c19) Thanks [@dependabot](https://github.com/apps/dependabot)! - Refresh the bundled Anthropic (`@anthropic-ai/sdk`, 0.116.0 to 0.117.1), Gemini (`@google/genai`,
  2.16.0 to 2.17.1), and `@xmldom/xmldom` (0.9.10 to 0.9.11) packages pinned in the `bundled` pnpm
  catalog. `@verbatra/sdk` bundles `@verbatra/ai-providers` and `@verbatra/format-adapters` into its
  published dist, so these exact versions ship to every consumer of `@verbatra/sdk` and
  `@verbatra/cli`.
  
  All three are routine patch and minor upstream releases with no consumer-facing breaking change.
  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior
  is unchanged.

- [#183](https://github.com/verbatra/verbatra/pull/183) [`2914739`](https://github.com/verbatra/verbatra/commit/2914739774c745859de1176167fac53e383a8b35) Thanks [@dependabot](https://github.com/apps/dependabot)! - Refresh the bundled `deepl-node` package (1.27.0 to 1.28.0) pinned in the `bundled` pnpm catalog.
  `@verbatra/sdk` bundles `@verbatra/ai-providers` into its published dist, so this exact version
  ships to every consumer of `@verbatra/sdk` and `@verbatra/cli`.
  
  Routine upstream minor release with no consumer-facing breaking change. `@verbatra/cli` is
  version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is unchanged.

## 0.9.0

### Minor Changes

- [#178](https://github.com/verbatra/verbatra/pull/178) [`aa337dc`](https://github.com/verbatra/verbatra/commit/aa337dc0e5c0f05acee1364fa0dde01f03a03bc9) Thanks [@mariokreitz](https://github.com/mariokreitz)! - A parse failure on a target locale file now names the file. `check`, `diff`, `export`, and every
  other read of a target file used to surface the adapter's bare message, so a corrupt locale in a
  twenty-locale project reported only `error [INVALID_JSON] The file is not valid JSON.` and left you
  bisecting with `--locales` to find it. The message now reads
  `The fr locale file at /app/locales/fr.json could not be read: The file is not valid JSON.` The
  error type, its code, and the exit code are unchanged, so anything branching on `INVALID_JSON` keeps
  working. This covers every adapter and every adapter error code, not just malformed JSON.

  `doctor`'s source locale file check now reads and parses the file instead of only probing for its
  existence. A directory standing in for the source file, an empty file, and malformed content used
  to pass the check while making every other command fail; each is now reported, with the same
  message `check` would give. When the configured format resolves to no adapter there is nothing to
  parse with, so the check falls back to existence alone and says so. The check keeps its
  `source-file` id and its place in the report.

- [#169](https://github.com/verbatra/verbatra/pull/169) [`5d7ec20`](https://github.com/verbatra/verbatra/commit/5d7ec20a4b46361db3c359e7ce792049598ae51a) Thanks [@mariokreitz](https://github.com/mariokreitz)! - `@verbatra/sdk` now ships the config schema as a JSON Schema document at
  `@verbatra/sdk/config-schema.json` (`dist/config-schema.json`), generated at build time from the
  same zod schema the SDK validates with. Point an editor at it, through an in-file `$schema` key or
  an explicit editor mapping, and a `.verbatrarc.json`, `.verbatrarc`, or YAML config gets key
  completion and validation while you type. See the config-file page for both wiring paths and for
  the three runtime rules the document cannot express.

  The config object now accepts an optional top-level `$schema` key, so an editor pointer no longer
  trips the strict-object check. It is ignored at runtime and is the only extra key tolerated.

  One behavioral detail for anyone branching on a validation issue's `code`: the `files.pattern` must
  contain the `{locale}` token rule moved from a whole-config refinement to a field-level regex, so
  its issue `code` changed from `custom` to `invalid_format`. The message and the `["files",
"pattern"]` path are unchanged, and an empty `files.pattern` now reports two issues (minimum length
  and the token rule) where it previously reported one. The same move applies to the
  openai-compatible provider's `baseUrl` scheme guard, whose `code` changed from `custom` to
  `invalid_format` with its message unchanged.

- [#167](https://github.com/verbatra/verbatra/pull/167) [`9d3a8f8`](https://github.com/verbatra/verbatra/commit/9d3a8f850991c9bf862eb443ebc9e41e575c1639) Thanks [@mariokreitz](https://github.com/mariokreitz)! - New `verbatra doctor` command and its `doctor()` SDK entry point: a preflight that answers "is this
  project set up correctly?" and spends nothing. It constructs no provider, makes no network request,
  writes no file, and never reads an API key value.

  Five checks run, each reporting its own verdict: the config loads and validates, the configured
  format resolves to a file adapter, the configured provider ID resolves to a provider factory, the
  environment variable that provider reads its key from is set, and the source locale file exists.
  Every check runs even when an earlier one failed, so one run reports every independent problem
  rather than stopping at the first. When the config itself cannot be loaded, the four checks that
  need it report `skipped` instead of a verdict they could not reach.

  This is the validation that was missing for a fresh project. `verbatra check` was the cheapest one
  available, but it reads the locale files and dies with `SOURCE_UNREADABLE` before it can tell you
  anything, so it could never validate a project whose source file is not in place yet.

  Details worth knowing:

  - The API key is checked by name only. `doctor` asks whether the variable is set, never what it
    holds, so no key value is read, printed, or validated against a provider. The
    `openai-compatible` provider is the one exception to a missing variable being a failure: it
    falls back to a placeholder key, so an unset variable passes unless the config names its own
    through `provider.options.apiKeyEnvVar`.
  - A missing target locale file is not a problem, since `translate` creates it. A missing source
    locale file is, because every other entry point fails on it.
  - The command takes the shared `--cwd` and `--config` flags plus `--json`, which prints the report
    in the usual envelope. It exits `0` when every check passed and `1` when any check failed, the
    same "it ran, the result is not clean" meaning `check` and `diff` already carry. Exit `2` stays
    reserved for `doctor` being unable to run at all, such as a `--config` path that does not exist.
  - Like `translate`, the command loads `.env.local` and then `.env` before it looks at the
    environment, so a key kept in a dotenv file counts as set.

- [#172](https://github.com/verbatra/verbatra/pull/172) [`af21823`](https://github.com/verbatra/verbatra/commit/af21823c72dfb90967693205eacaafc971a484bd) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Two new entry points read and change a file-backed glossary: `readGlossaryFile` returns the current
  terms straight from disk, and `updateGlossaryTerm` adds, replaces, or removes exactly one term and
  returns the glossary as it now stands. Both take the `GlossaryProvenance` a loaded config reports
  rather than a path, so the file they touch is always the one the config names.

  Only a file-backed glossary can be changed. A glossary written inline in the config module is
  refused with the new `GLOSSARY_NOT_FILE_BACKED` code rather than rewritten, and a failed write is
  reported as the new `GLOSSARY_UNWRITABLE` code. A write takes a project-wide glossary lock for the
  whole read-modify-write, replaces the file atomically, keeps the existing key order and indentation,
  and is held to the same size and shape limits `loadConfig` enforces when it reads a glossary back.

- [#166](https://github.com/verbatra/verbatra/pull/166) [`08fec43`](https://github.com/verbatra/verbatra/commit/08fec434584a61f1bf1673a7b674c055ae15833c) Thanks [@mariokreitz](https://github.com/mariokreitz)! - A lock-file that turns corrupt while an import is running now aborts the whole run, exactly as it
  already did during `verbatra translate`. `verbatra import` exits `2` instead of `1`, and
  `importWorkbook()` rejects with `LOCK_FILE_INVALID` where it previously resolved with the corruption
  recorded as one failed locale per sheet.

  The lock-file is one shared file, so continuing bought no partial progress: every remaining locale
  wrote its translations to disk and then failed to record them in the lock-file, leaving the project
  looking up to date when it was not. Locales applied before the abort stay written; fix the lock-file
  and import again.

- [#168](https://github.com/verbatra/verbatra/pull/168) [`ccd5c58`](https://github.com/verbatra/verbatra/commit/ccd5c587de4e176ba00f5b966dda48eeff4a0f82) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Supplying `deps.fs` now redirects the locale files too, so an SDK run can be fully in memory. The
  format adapters previously read and wrote translations through `node:fs` directly, which meant a
  custom `SdkFs` covered the run-status file, the lock-file, the glossary and workbook I/O, but never
  the project's actual payload. Adapters now take a file-system port at construction time, and the SDK
  builds that port from `deps.fs`.

  Nothing changes for a caller that does not pass `deps.fs`: adapters keep their node-backed
  implementation, including the fsync-and-rename atomic write. One limitation remains, and it is now
  documented on `SdkFs`: adapters supplied through `deps.adapterRegistry` were constructed by the
  caller, so `deps.fs` cannot reach them. Passing both means you own that wiring.

- [#164](https://github.com/verbatra/verbatra/pull/164) [`7a361f9`](https://github.com/verbatra/verbatra/commit/7a361f963124c8e4e507b07e06c6dd9b22481e03) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Read this before upgrading: `verbatra translate` and `verbatra import` now exit `1` when a
  locale comes out partial. A pipeline that passes today can start failing after this upgrade,
  and that is the point of the change. A partial locale is one whose file was written to disk
  with some keys still missing, so a run that reports `0 succeeded, 1 partial, 0 failed` used to
  exit `0` and let a half-translated file through a CI gate. If your pipeline starts failing here,
  it was already shipping incomplete translations. Re-run the affected locale (now possible with
  `--locales`), or if you genuinely want to accept a partial result, branch on the `partial` field
  of the `--json` summary yourself rather than on the exit code.

  The exit code is `1`, not a new code: `1` already means the command ran but the result is not
  clean, which is exactly this case. The asymmetry that hid the bug is gone too. Re-running the
  same broken state used to exit `1`, because the failing key was then the only candidate and
  nothing was accepted, so the worse a run went, the more likely it was to exit `0`.

  Three further changes come with it:

  - `translate` and `watch` accept `--locales de,fr` (SDK: `locales`), matching `check`, `diff`,
    and `export`. Translating one locale at a time is what a rate-limited free tier needs, and it
    is the quickest way to re-run a single locale that came out partial. An unconfigured locale
    fails with `UNKNOWN_LOCALE` before anything is read or spent, and `watch` validates the subset
    once at startup rather than on every run.
  - An unwritable target locale file now fails with a structured `TARGET_UNWRITABLE` naming the
    real target and the file-system code, instead of a raw `EACCES` quoting the internal temporary
    file that the atomic write had already deleted. `TARGET_UNWRITABLE` is a new `SdkErrorCode`:
    `translate` and `importWorkbook` record it on the affected locale, `editEntry` and
    `retranslateEntry` throw it.
  - A `PROVIDER_ERROR` from an unreachable endpoint now names the transport cause (connection
    refused, host name not resolved, connection closed, host unreachable, untrusted TLS
    certificate) and what to check. For `openai-compatible` it also names the host and port of the
    configured `baseUrl`. Only the URL's host component is used, so a path, query, or embedded
    credential in `baseUrl` can never reach a message. The error codes themselves are unchanged.

- [#180](https://github.com/verbatra/verbatra/pull/180) [`131764a`](https://github.com/verbatra/verbatra/commit/131764a494528d3a84d0b358d78aa7b95df495a8) Thanks [@mariokreitz](https://github.com/mariokreitz)! - `runStatus` now absorbs a file-system read that rejects, reporting `available: false` like every
  other unusable status file. Its documented contract was already that the read is total and that the
  call throws nothing, and `readTranslationMemory` already guarded the same call, but the run-status
  read did not, so an injected `deps.fs` whose read rejected escaped to the caller.

  Corrections to the published documentation, with no behavior attached:

  - `editEntry` and `retranslateEntry` now say that the target locale file surfaces the adapter's own
    error on the write as well as on the read. The write raises one when the entries cannot be
    represented in the configured format, or when the existing destination file cannot be read back to
    be updated in place, and it is re-thrown unchanged so its code survives. The earlier wording
    implied the target read was the only unwrapped case, which sent callers into a
    `catch (e) { if (e instanceof SdkError) }` that missed the write path.
  - `exportWorkbook` now documents that a failure to write the handoff itself propagates as the raw
    file-system error rather than as `TARGET_UNWRITABLE`, which is scoped to locale files.
  - `RunSummary.locales` no longer claims configured target order for every producer. `translate` and
    `watch` keep that order; `importWorkbook` reports handoff order and appends the locales the
    handoff had nothing for.
  - `SdkErrorCode` now carves `doctor` out of the `UNKNOWN_FORMAT` and `LOCALE_LAYOUT_INVALID`
    universals, matching the carve-outs it already documented for `CONFIG_NOT_FOUND`. `doctor` reports
    both as failed checks rather than throwing.
  - `watch` now documents that a failure to construct the watcher escapes unwrapped at startup.
  - `DoctorDeps.fs` now says it is threaded into the config loader, so it backs the glossary-file read
    as well as the source locale file.

- [#163](https://github.com/verbatra/verbatra/pull/163) [`4f66427`](https://github.com/verbatra/verbatra/commit/4f66427fd4e200c8b08ad9c27fa48cc9e359a70c) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Reject a fabricated single-brace placeholder under the double-brace formats.

  For `i18next-json`, `ngx-translate-json`, and `yaml`, a `{name}`-shaped token is literal
  text rather than interpolation, so it was never extracted as a placeholder and the
  integrity gate could not see it. A translation could therefore alter `{name}` to `{nome}`,
  keep `{orderId}` while inventing `{evilInjected}`, or inject `{stolenSecret}` into a
  placeholder-free source, and every one of those was accepted and written on all three write
  paths (provider translation, workbook import, and a Studio edit). Once written, the value
  locked against the source hash, so `check` and `diff` then reported the locale up to date.

  These adapters now supply a placeholder comparator that adds a one-directional check on top
  of their existing double-brace comparison: a `{name}`-shaped token present in the candidate
  and absent from the source is reported as `extra`, which the gate refuses with the existing
  `placeholder` reason. No new gate reason and no new config key. The check is deliberately
  one-directional, because dropping such a token is undecidable without knowing the project's
  interpolation delimiters, which verbatra has no setting for.

  This is behavioural, not additive: a run that is green today can newly report integrity
  mismatches, and those candidates are withheld rather than written. That includes results
  from DeepL, whose entry partitioning is unchanged but whose output now goes through the same
  comparator. A key it withholds was already carrying a placeholder its source never had.

### Patch Changes

- [#162](https://github.com/verbatra/verbatra/pull/162) [`3b5942d`](https://github.com/verbatra/verbatra/commit/3b5942d4db01800667b3d3c33ba5778b750f9b8f) Thanks [@mariokreitz](https://github.com/mariokreitz)! - Republish with no code changes. The published package metadata (`repository.url`
  and `bugs.url`) now points at github.com/verbatra/verbatra, the repository's
  current location after the move to the verbatra organization. The previous
  release was published shortly before that rewrite landed, so its metadata still
  referenced the old path.

## 0.8.0

### Minor Changes

- d060201: Export `EXCHANGE_FORMATS` and `DEFAULT_EXCHANGE_FORMAT` from the SDK.

  `EXCHANGE_FORMATS` lists every translator-handoff format at runtime (`xlsx`, `csv`, `tsv`) and
  `DEFAULT_EXCHANGE_FORMAT` names the one `exportWorkbook` and `importWorkbook` use when the caller
  passes none. Until now the SDK published only the `ExchangeFormat` type, so anything validating a
  `--format` argument had to restate the members, and a plain `readonly ExchangeFormat[]` accepts a
  subset without complaint: a format added to the SDK would have been rejected by such a check with no
  compile error to catch it. The new export is built from a record keyed by the format type itself, so
  a member missing from the list is a compile error.

  The CLI now takes both the accepted values and the default from these exports, which also removes
  the duplicated format list from the `export` and `import` help text. That text now reads
  `handoff format: one of xlsx, csv, tsv (default xlsx)`.

- ec4c000: Stop `verbatra init` from being able to write a config it just called valid.

  The command encoded which token-limit option each provider takes in two independent places:
  Anthropic calls it `maxTokens`, OpenAI and Gemini call it `maxOutputTokens`. One copy built the
  object checked against the config schema; the other produced the `verbatra.config.ts` text that was
  actually written to disk, and that copy was never validated. Any drift between them, an option
  renamed or a provider added, would have produced an `init` that reported success and left behind a
  config that failed to load on the very next command.

  `scaffoldingMetadata` now carries `providerTokenLimitKeys`, so the key is stated once, in the SDK,
  tied by a type constraint to the option each provider's own schema accepts. The CLI renders the
  provider block by serializing the exact options object the schema validated, rather than
  re-describing it, so the written text and the checked value cannot disagree.

  No change to the configs `init` produces for the providers shipped today.

### Patch Changes

- 8a274b0: Neutralize spreadsheet formula injection in the csv and tsv handoff. A value beginning with `=`,
  `+`, `-`, `@`, a tab, or a carriage return is executed as a formula when the file is opened in Excel
  or Google Sheets, and the exported `Current translation` and `Context` columns carry earlier
  provider output, which verbatra treats as untrusted. Tab and carriage return belong in that set
  because some spreadsheet importers strip them before parsing, so a value that leads with one still
  reaches the formula parser. The delimited writer now prefixes such a value with an apostrophe, the
  marker spreadsheets read as "this cell is text". Quoting alone is not a defense: spreadsheets
  evaluate a quoted formula too. The xlsx handoff was never affected, since it writes typed string
  cells.

  The escape is always reversed on import, so the guard itself never alters a value. The `Translation`
  column's long-standing trim on import is unrelated and unchanged: it still strips surrounding
  whitespace in that column, including a leading tab or carriage return, and that trim, not the guard,
  is what removes it. The two halves
  are exact inverses: the writer also escapes a value that already begins with apostrophes followed
  by a formula lead, so `'=1+1` is written as `''=1+1` and read back as `'=1+1`. A value whose
  apostrophe does not lead a formula, such as `'tis`, is left alone in both directions. A leading
  space is not part of the guard and is never escaped.

  Consumer impact: exported csv and tsv files gain a leading apostrophe on affected values, which is
  visible in a text editor and invisible in a spreadsheet. A translation value beginning with a tab or
  a carriage return now exports with a leading apostrophe as well. One legacy edge exists. A csv or
  tsv exported by an earlier version, holding a value that genuinely starts with an apostrophe
  followed by a formula lead (`'=...`, and now also an apostrophe followed by a tab or a carriage
  return), loses that apostrophe when imported by this version, because the older export did not
  escape it. Re-export the handoff before filling it in to avoid that. Values without a leading
  formula character are unchanged in every direction.

- b0dd696: Internal refactor pass over shared helpers and comments. No behavior, output, or public API
  changes: every type signature and the CLI surface are unchanged. Documentation comments on the
  workspace types that bundle into the published declarations were rewritten in this pass; the
  accompanying documentation entry describes the result.
- 3e725cc: Fix `translate` and `importWorkbook` deleting the lock-file baseline of a target key that has no
  source entry. Both paths write the locale's lock entries in replace mode and rebuilt them only from
  keys the source still has, so a key that lives in the target alone lost its recorded hash on every
  run. Generated CLDR plural forms are exactly that shape: `items_few` and `items_many` exist in a
  Polish target while the English source only has `items_one` and `items_other`. `translate` used to
  protect them, but only while `generatePlurals` was on; an import, or a run with the flag off, wiped
  them. Once the hash was gone the form counted as adopted rather than generated, so it was never
  reconsidered again even after its governing source string changed.

  Both paths now carry a source-less key's prior hash forward. The rule is keyed on the merged target
  content, so a key genuinely deleted from the target file still loses its entry, and a key that never
  had a hash (an existing plural form verbatra adopted rather than generated) still gets none.

  Consumer impact: lock files will keep entries that earlier versions dropped, so the next
  `translate` or `import` after upgrading can produce a larger `verbatra.lock.json` diff than usual.
  That diff is the repair. Hashes that earlier versions already deleted are not
  reconstructed: for a generated plural form whose baseline was lost, the form is now treated as
  hand-written and adopted, and re-running with `generatePlurals` on will not regenerate it. Delete
  that form from the target file to have it generated again.

- 74ac95f: Fix a top-level translation key named `__proto__` never getting a lock-file baseline. The lock
  entries for a locale were accumulated on a plain object with `entries[key] = hash`, which for that
  one key name hits the `Object.prototype` setter and is discarded rather than stored, and the
  lock-file reader then dropped the key a second time because zod's record parser skips it. The key
  was translated on the first run and, with no baseline to compare against, reported as unchanged
  from then on, so a later edit to its source text was never picked up. Both the `translate` and the
  workbook import path now build their lock entries through a `Map`, and the lock-file reader keeps
  the key as an own property. Nothing is written to `Object.prototype` on either path.

  Consumer impact: a project with a top-level `__proto__` key gets a lock entry for it on the next
  run, and from then on an edit to that key's source text is reported as changed and retranslated,
  which it should always have been. Nested keys such as `a.__proto__` were never affected.

- 23a6b1b: Fix the `ngx-translate-json` adapter corrupting a key that contains a backslash. Reading a nested
  file built the dotted path from the raw object keys, while writing decoded that path with
  backslashes treated as escape characters. The two halves disagreed, so `{"a":{"b\\c":"hello"}}` was
  written back as `{"a":{"bc":"hello"}}`: the value moved to a key the app never asks for, the real
  key looked untranslated on every later run and was paid for again, and the mangled key piled up as
  an orphan. Backslashes in a key segment are now escaped when the path is built, symmetrically with
  the decoding the write path already did, and the flat-file writer decodes the path back so a flat
  file still round-trips byte for byte. Only `ngx-translate-json` uses path-notation keys; the
  i18next, next-intl, and vue-i18n adapters were never affected.

  Consumer impact, for an ngx-translate project that has a backslash in a key: that key's spelling
  changes, from `a.b\c` to `a.b\\c`, everywhere verbatra names it (the lock-file, an exported
  workbook, CLI output). The old lock entry no longer matches and is dropped on the next write. What
  happens next depends on the file the key lives in. If the target file still holds the value under
  the right key (flat files always did, since they were written verbatim), the key is adopted as up
  to date: no provider call, no cost, and a fresh baseline is recorded. If the target was already
  corrupted by an earlier version, the correct key is genuinely missing and is translated once, and
  the mangled key is reported as orphaned; remove it, or run with `--prune`. Keys without a backslash
  are unaffected.

- 3178757: Fix run status writing to go through the injected `SdkFs` instead of calling `node:fs/promises`
  `mkdir` directly. Before this fix, a run that recorded run status created the `.verbatra-local`
  directory on the real file system even when a custom `deps.fs` was supplied; that directory
  creation now goes through the seam. The `SdkFs` interface is unchanged: the existing optional
  `mkdir` member already carried this capability, so the published declarations are identical.

  A custom `deps.fs` whose `writeFile` targets a real directory tree must now implement the optional
  `mkdir` member for the run status file to be written, since the SDK no longer creates that directory
  behind the seam. Run status writing is best-effort, so a fs without it degrades to no run status
  file rather than failing the run.

- 6b37fe9: Correct factual errors in the published API documentation. No behavior or type-signature change;
  the corrections ship in the generated declarations, so consumers reading the documented contract
  get a different answer than before.

  The substantive corrections: `translate` and `importWorkbook` no longer document a thrown
  `LOCK_CONTENDED`, and `importWorkbook` no longer documents a thrown `CONFIG_INVALID`, because both
  surface those codes on the affected locale's summary and let the other locales continue.
  `translate`'s `LOCK_FILE_INVALID` is documented as aborting a live run after locales have started
  rather than before any locale runs. The `degenerate` integrity-gate reason describes what is
  actually detected (a large length blowup or runaway repetition) rather than an untranslated echo.
  `SubBatchProgressEvent.batchIndex` is documented as 1-based, and the event as announcing an
  attempt, since a batch withheld by an exhausted budget still emits. The `SdkFs` seam no longer
  claims a custom implementation makes a run fully in-memory: locale files are read and written by
  the format adapters outside the seam. Also corrected: `LocaleSummary.error` can be absent on a
  failed locale, `DEFAULT_DELIMITED_PATH` names a directory, a delimited import accepts a single
  file, `EQUALS_SOURCE` compares trimmed values, `watch` runs once immediately at startup, and the
  read-only entry points document that a malformed target file surfaces the adapter's own parse
  error unwrapped.

- d7c7a44: Document the published SDK API. Every declaration that ships in the package's type declarations now
  carries JSDoc: entry points describe their behavior and the error codes they throw, input, result,
  and event shapes document each property, and the config, provider, and adapter types inlined from
  the workspace packages are documented too. Editors show these on hover. No runtime behavior, output,
  or type signature changes.

## 0.7.1

## 0.7.0

### Minor Changes

- 7085769: Classify a provider HTTP 5xx as its own `PROVIDER_UNAVAILABLE` error code instead of the generic
  `PROVIDER_ERROR` fallback.

  A hard provider outage returns 5xx, which previously matched none of the status or error-class
  checks and fell through to `PROVIDER_ERROR`, the code reserved for failures nothing could classify.
  An outage and an unrecognized failure are different things, and only the first is worth retrying
  later or routing to another provider, so they now carry different codes.

  The new code is deliberately separate rather than folded into `TIMEOUT` or `RATE_LIMITED`: both of
  those name a specific, different failure, and reporting an outage as "the request timed out" or
  "you were rate-limited" would be untrue in the text a user reads. A sub-batch withheld during an
  outage now names `PROVIDER_UNAVAILABLE` in its notice.

  Classification of every other failure is unchanged. In particular 401 and 403 still classify as
  `AUTH_FAILED`, which remains permanent and not worth retrying.

- 6fb1941: Add a CSV and TSV translator interchange alongside the Excel workbook.

  `export` and `import` take a `--format` flag (`xlsx` by default, plus `csv` and `tsv`), and the SDK's
  `exportWorkbook` and `importWorkbook` take the matching optional `format` field. Passing no format
  keeps the existing xlsx behavior exactly as it was.

  A delimited export writes one `<locale>.csv` or `<locale>.tsv` per target locale, so `--out` names a
  directory for those formats (default `verbatra-translations`) and stays a file path for `xlsx`. The
  directory is created if it is missing. Import accepts either that directory or a single interchange
  file, and takes the locale from the file name. Files carry the same columns as the workbook, are
  written with LF line endings (and a UTF-8 BOM for `csv`, which Excel needs), and are quoted per
  RFC 4180, so a value containing the delimiter, a quote, a line break, or padding whitespace
  round-trips exactly.

  Every imported row runs the same source-drift, placeholder, and ICU gate as the workbook path. A
  delimited file has no cell protection, so its source-hash column is visible and editable: an edited
  or blanked hash is never trusted, the row is withheld as drift and reported. Parsing is bounded by
  explicit input-byte, row, field-count, and field-length caps, and a malformed row or a duplicate key
  is reported per row instead of aborting the file.

- 6871028: Report the file line as well as the record number for a malformed row or duplicate key in a csv or tsv
  import.

  A delimited record that holds a quoted line break covers one spreadsheet row but several editor lines,
  so the record number alone stopped matching what a translator saw in a text editor as soon as any
  earlier row contained such a break. Both numbers are now reported and labelled: `row` is the record
  number a spreadsheet shows, and the new optional `line` on `MalformedRowReport` and
  `DuplicateKeyReport` is the file line the record starts on. The line is correct for LF, CRLF, and lone
  CR breaks, and is derived from the same single scan of the file.

  The CLI renders `row 4, line 7 (Status)` for a delimited import and the unchanged `row 4 (Status)` for
  an xlsx one, which carries rows rather than lines and reports no `line` at all.

- 21459a6: Add locale directory layout styles and the locale path resolver.

  `files` gains an optional `localeStyle` of `"literal"`, `"posix"`, or `"android"`. It controls what
  the `{locale}` token in `files.pattern` expands to for each locale:

  - `"literal"` is the default and what a config without the field gets: the configured tag verbatim.
    Every existing project resolves to exactly the paths it did before, byte for byte.
  - `"posix"` replaces `-` with `_`, for gettext directories (`locale/pt_BR/LC_MESSAGES/messages.po`)
    and the Java `messages_{locale}.properties` suffix layout.
  - `"android"` expands the token to a complete Android resource-directory segment, `values` prefix
    included: `values` for the source locale, `values-de`, `values-pt-rBR`, `values-fil-rPH`, and the
    modified BCP-47 form `values-b+zh+Hans`, `values-b+es+419`, `values-b+sr+Latn+RS` where the legacy
    qualifier cannot express the tag. The pattern is `res/{locale}/strings.xml`, and the token must
    occupy a whole path segment under this style.

  The new `createLocalePathResolver(cwd, config)` is exported from the package root. It resolves a
  locale to its absolute file path (`pathFor`) and a path back to the locale that owns it
  (`localeFor`, `undefined` for a path the project does not own). Every SDK flow now resolves paths
  through it, so a consumer that watches or reports on locale files uses the same mapping rather than
  re-deriving it.

  `SdkErrorCode` gains two members, both raised when the resolver is created and so before any file is
  read and before any provider call:

  - `LOCALE_LAYOUT_INVALID`: the pattern and style cannot be combined, or the style has no valid
    spelling for a configured locale (`zh-Hans` under `"posix"`, for instance), or a locale expands to
    something that is not a single path segment. A style refuses rather than guesses, because a wrong
    directory name is written successfully and then silently ignored at runtime.
  - `LOCALE_PATH_COLLISION`: two configured locales resolve to the same absolute path.

- 4720494: Stop a narrower delimited re-export from leaving locale files a later import reads as fresh.

  A `csv` or `tsv` export writes one file per locale into a directory, so re-exporting into a directory
  that still holds output from an earlier run with a wider `--locales` selection left the dropped
  locales' files behind, indistinguishable from the ones just written. The next import read them and
  applied outdated translations silently.

  A delimited export now records the locales it wrote in a hidden per-format manifest in the output
  directory (`.verbatra-export-csv.json` or `.verbatra-export-tsv.json`), written after the locale
  files. Import reconciles a handoff directory against it: a locale file the most recent export did not
  write is refused as a leftover and reported as that locale's failure (`HANDOFF_FILE_STALE`) instead
  of being applied. A directory with no readable manifest (assembled by hand, or round-tripped through
  an archive that dropped the hidden file) is read exactly as before, and naming a single interchange
  file directly is still taken at face value.

  The export deletes nothing. Nothing in the output directory is removed or overwritten except the
  per-locale files this export writes and its own manifest, so an unrelated file placed there is never
  at risk.

### Patch Changes

- 2d119f8: Refresh the npm package metadata. The cli and sdk descriptions now name the providers, including running against an openai-compatible local or self-hosted model, and their keywords cover the supported formats (XLIFF, YAML, ARB, Flutter, Java properties) alongside the i18n libraries. The studio keywords gained the terms its dashboard is searched by, and its homepage now points at the Verbatra Studio documentation page. `verbatra --help` prints the same positioning as the package listing, so the banner no longer contradicts it.
- 6b911af: Stop plural generation from overwriting a plural form the target file already holds.

  With `generatePlurals` on, generation derived its candidates from the source resource and the lock
  baseline alone, so it never saw the target file. On a first run there is no baseline, which made every
  candidate look ungenerated: a hand-translated Polish `items_few` was sent to the provider and its
  answer written over the existing value. This was the one path where a first run could destroy existing
  translation work instead of adopting it.

  Generation now consults the target. A candidate key the target already fills, and that the lock file
  does not claim, is adopted: it is never sent to the provider, never written over, and stays untracked
  in the lock so later runs keep adopting it. A key the lock does track was generated by an earlier run
  and still gets regenerated when its governing source plural forms change, so the update path is
  unchanged. Missing siblings of an adopted form are still generated as before.

- 1d3d92d: Refresh the bundled provider SDKs to their current patch and minor releases.

  `@anthropic-ai/sdk` moves from 0.115.0 to 0.116.0, `@google/genai` from 2.15.0 to 2.16.0, and
  `openai` from 7.3.0 to 7.4.0. These are the versions a consumer installs alongside
  `@verbatra/sdk`, so they reach the consumer lockfile, audit surface, and SBOM.

  This is a routine dependency refresh with no verbatra API change: the provider strategies, the
  shared `runLlmTranslation` layer, and the translation response schema are all untouched, and no
  configuration or CLI behavior changes.

## 0.6.4

### Patch Changes

- 07df69b: Create a locale file's directory instead of failing when it does not exist.

  Adding a target locale failed outright for any project whose `files.pattern` puts the locale in a
  directory rather than the filename. `locales/{locale}/common.json`, the standard layout for i18next
  namespaces, is the common case: the first run for a new locale has nowhere to write, so the write
  threw.

  The failure was also hard to act on. It surfaced as a raw `ENOENT` naming the hidden temporary file
  the atomic write uses, not the path configured in `files.pattern`, so the error pointed at a file
  that had never been asked for and no longer existed by the time anyone looked.

  The write path now creates the containing directory first. It applies to every format, since they
  all write through the same path, and it is a no-op for the flat `locales/{locale}.json` layout
  where the directory is already there.

  This covers the locale files an adapter writes. `verbatra export --out` still fails the same way
  when the workbook's directory does not exist, because that goes through a different write inside
  the SDK; it is tracked separately.

- e6de185: Disclose four bundled runtime dependency moves that shipped undisclosed in 0.6.3.

  These versions changed in `@verbatra/sdk`'s published `dependencies` between 0.6.2 and 0.6.3
  without a changeset or a changelog entry. They are real dependencies of the published tarball,
  not internals, so each one lands in a consumer's `node_modules`, lockfile, `npm audit` output
  and SBOM. This entry is the retroactive record; no version moves as part of it.

  - `openai` 6.46.0 to 7.3.0
  - `@anthropic-ai/sdk` 0.111.0 to 0.115.0
  - `@google/genai` 2.11.0 to 2.15.0
  - `@formatjs/icu-messageformat-parser` 3.5.11 to 3.5.16

  `openai` is the only major. Its sole breaking change is a new `engines.node` floor of `>=22.0.0`,
  which every published verbatra package already subsumes by declaring `>=22.14.0`, so no consumer
  meeting verbatra's own floor is affected. The provider seam was verified against the new major
  rather than assumed compatible: the emitted error modules are byte-identical between the two
  versions, which is the check that matters because provider error classification matches on the
  runtime constructor name, and the `ChatModel` union is unchanged, so the published declarations
  do not shift either. `@anthropic-ai/sdk` was checked to the same depth. `@google/genai` and
  `@formatjs/icu-messageformat-parser` are recorded as version moves only, with no compatibility
  claim beyond a green build and test suite.

  Nothing is being rolled back. CI now fails any pull request that changes what a published package
  makes consumers install without a changeset, so this class of silent move cannot recur.

- 1ae3be9: Report a contended lock even when the acquire budget has already elapsed.

  `onWait` is documented to fire once right after the first failed acquire, so a caller can render a
  "still waiting" line. It did not fire at all when the acquire budget elapsed during that first
  attempt: the deadline was checked before the notification, so the call threw `LOCK_CONTENDED`
  having reported nothing, and a caller that had asked to be told about contention saw only the
  failure.

  The notification now runs before the deadline check. On the ordinary path nothing changes, because
  the notifier already throttles a notice emitted moments after the previous one.

  The CLI is unaffected, since `--lock-timeout` is taken in whole seconds and so never produces a
  budget short enough to hit this. It is reachable from the SDK, where `lockAcquireTimeoutMs` accepts
  any millisecond value.

- 9aafc43: Leave a target locale file untouched when a run changes nothing in it.

  `translate` rewrote every target file on every run, even when nothing was translated, pruned or
  generated. The content was identical, so the change was invisible in git for a file already in
  verbatra's formatting, but the write still replaced the file: the inode and mtime changed on every
  run, which retriggers third-party file watchers (Vite, webpack, a framework dev server) for no
  reason, and a hand-formatted target was reformatted to canonical form the first time.

  That reformatting is the case that could actually fail a build. A drift check that runs
  `verbatra translate` and then `git diff --exit-code` would report a change on a project whose
  locale files were formatted by hand, even though no translation happened.

  The write is now skipped when nothing was accepted, pruned or generated, and the target already
  exists. The existing-target condition matters: a first run for a new locale also accepts nothing
  when there is nothing to translate, and the file must still be created there, or a later `import`
  of that locale would fail on a missing file rather than reading an empty one.

  Nothing else changes. Lock-file entries, the translation-memory cache and the run summary are all
  computed exactly as before, so a skipped write never hides a key from the summary or the lock file.

## 0.6.3

### Patch Changes

- dda9ede: Re-gate a fanned-out translation against the key it is written to.

  Within-locale deduplication sends one representative per source content hash and
  copies its accepted value onto every duplicate key. That copy skipped
  `gateCandidateValue`, on the stated guarantee that an identical content hash
  implies identical placeholder and ICU fields. It does not: the hash is computed
  over canonicalized text (NFC-normalized, CRLF folded to LF) while the gate
  compares placeholder tokens raw, so the hash is a lossy function of exactly the
  bytes the gate inspects.

  Two keys whose non-ASCII placeholder name differs only by Unicode normalization
  form therefore hashed equal, and the representative's value was written to the
  duplicate even though it fails that key's own placeholder check. The run
  reported success: a fanned-out value makes no provider call so no review flag
  fires, and the key was then locked in as correct and never re-attempted.

  Each duplicate is now re-gated against its own source entry, and a rejection is
  withheld as an integrity mismatch instead of written, so the key is re-attempted
  on the next run. The check is pure and runs only for keys that actually have
  duplicates, so the deduplication saving is unchanged and the ordinary
  byte-identical case still costs one request.

- 4bb2bf2: Release every locale's write lock before `translate()` settles on a whole-run
  failure.

  With `concurrency` greater than 1, the locale pool awaited its workers with
  `Promise.all`, which rejects on the first failure but does not stop the others.
  A whole-run error (in practice a corrupt lock file, surfaced as
  `LOCK_FILE_INVALID`) therefore rejected `translate()` while the remaining
  workers were still inside their critical sections. Three things followed: their
  lock files were still held when the caller unwound, and the CLI's synchronous
  exit truncated the pending release, leaving orphaned locks that blocked the next
  run for the full lock timeout, per locale, until someone deleted them by hand;
  the pool kept pulling from the queue, so locales that had not started yet took
  fresh locks, issued real provider calls and wrote their target files after the
  run had already been reported as failed; and an SDK caller that caught the
  rejection was wrong about both what was on disk and what had been billed.

  The pool now records the failure instead of propagating it immediately. The
  recorded reason doubles as an abort flag, so no worker claims another locale,
  and the pool still awaits every in-flight worker so each one unwinds and
  releases its lock before the error is re-thrown unchanged.

  Note for SDK consumers: `translate()` now rejects after the slowest in-flight
  locale finishes rather than instantly. The error, its code and the exit code are
  unchanged, as is `concurrency: 1` and the isolation of ordinary per-locale
  failures.

- b75967c: Leave a cache file with an unrecognized version on disk instead of downgrading
  it.

  `readTranslationMemory` degrades an unrecognized-version cache to an empty
  memory, which is the correct and documented read contract. But the end-of-run
  write replaces the whole file, so a cache written by a newer verbatra was
  silently destroyed and relabelled with this build's version, keeping only the
  current run's entries. The same happened through `editEntry`,
  `retranslateEntry` and `importWorkbook`.

  The read now also reports whether the file may be written, and the write paths
  honour it. The distinction is narrow on purpose: only a structurally valid file
  whose `version` is unrecognized is preserved. A missing file is still created, a
  corrupt, schema-invalid or oversized one is still overwritten so the cache
  self-heals rather than wedging, and a `version` of zero, negative or
  non-integer fails the schema's positive-integer check and is treated as
  corruption.

  The run itself is unaffected: it proceeds with an empty effective cache,
  succeeds, and its exit code and summary shape are unchanged. It does report a
  `CACHE_VERSION_UNRECOGNIZED` notice, because the alternative is a mistyped
  version disabling caching permanently with no signal at all.

  This adds `CACHE_VERSION_UNRECOGNIZED` as an additive member of the exported
  `SdkNoticeCode` union on `@verbatra/sdk`. The behavior fixed is a defect, so the
  bump stays patch, but the addition to the public type is called out here as
  deliberate, exactly as `BLANK_ROW_BASELINE_RETAINED` was in 0.4.4. `writable` is
  returned alongside the memory rather than added to it, so the exported
  `TranslationMemory` type is unchanged.

- a4f6831: Keep `verbatra.cache.json` gitignored in projects scaffolded before it existed.

  The ignore entry was only ever written by `verbatra init`, so a project
  initialized on an earlier release never received it. Every write path creates
  the cache at the project root, so upgrading users got a new untracked file next
  to their locale changes and were liable to commit it, contradicting the cache's
  own documented contract that it is local, gitignored and never committed.
  `.verbatra-local/` is the same defect one release earlier.

  `translate`, `watch` and `import` now top up an existing `.gitignore` with any
  entry it is missing, once per invocation. The check is deliberately narrow: it
  never creates a `.gitignore` that does not exist, it is silent so `--json`
  stdout is untouched, it never fails a run, and it decides purely on file
  presence and content, with no `git` subprocess and no new dependency. Re-running
  `verbatra init` still produces no duplicate entry. The cache file does not move.

  If you already committed `verbatra.cache.json`, no `.gitignore` change untracks
  it; run `git rm --cached verbatra.cache.json` once. On the current release you
  can also get the entry today, without upgrading, by re-running
  `verbatra init --provider <id> --yes`, which is non-destructive because it skips
  every file that already exists.

- d39ae24: Report every blank workbook row that still needs a translation as `unfilled`.

  A blank row was recorded into `summary.locales[].unfilled` only when the row had
  been exported with status `changed`. A never-translated key exports as `new`, so
  the most common unfilled case of all, a first handoff where every row is new,
  reported nothing: importing an entirely untouched workbook gave `unfilled: []`
  and a clean success, with no inventory of the pending work.

  Membership is now decided by the import-time diff rather than by the status
  string recorded in the exported row, so a blank row for a key that still needs a
  translation is reported whether it was exported as `new` or `changed`. A row
  exported as `changed` whose key has since stopped needing work is correspondingly
  excluded.

  No exit code moves. `unfilled`, `malformedRows` and `duplicateKeys` still do not
  feed a locale's status, which is a settled decision now recorded in the summary
  type's own documentation rather than left to be rediscovered: `check` and `diff`
  already answer "is this project fully translated", failing on unfilled work
  would break the locale-at-a-time handoff, and a malformed row is decided on its
  Status cell alone, so that bucket cannot distinguish dropped work from absent
  work in the first place.

- 2c37673: Reject an empty translation of a non-empty source in the integrity gate.

  `gateCandidateValue` accepted `""` as a valid translation whenever the source
  carried no placeholders: the placeholder check compared `[]` against `[]`,
  `validateMessage("")` is true on every adapter including the ICU ones, and the
  degeneracy assessment finds no runaway repetition in a zero-length value.
  Whitespace-only values were accepted the same way. On the two adapters that
  define `comparePlaceholders` (next-intl and ARB), even a source carrying a
  placeholder accepted an empty translation, because that branch re-derives from
  the source value.

  The consequences were silent and reported as a clean success. A provider
  returning `""` had the empty value written, counted as translated, and stored in
  the translation-memory cache; on a changed key it destroyed an existing good
  translation. Because the cache is keyed by source content, the empty value was
  then served to every other key whose source text was byte-identical, with no
  provider call to notice it and nothing in `check` or `diff` to surface it.

  An empty or whitespace-only candidate for a non-empty source is now withheld
  with the new `empty` reason, on every write path: the provider path, content
  fan-out, plural generation, workbook import, `editEntry` and
  `retranslateEntry`. The check runs last, so no existing rejection reason
  changes; only the wrongful accepts do. An empty source still round-trips an
  empty translation.

  Separately, a `[[CLEAR]]`ed workbook row no longer contributes to the cache.
  `[[CLEAR]]` states an intent about one key, and the cache is content-addressed,
  so storing it would hand the clear to unrelated keys sharing that source text.
  Clearing a key still works exactly as before and is still the only supported way
  to unset a translation.

  This adds `empty` to the exported `IntegrityGateReason` union on
  `@verbatra/sdk`. The behavior fixed is a defect, so the bump stays patch, but
  the addition to the public type is called out here as deliberate, following the
  policy recorded for `BLANK_ROW_BASELINE_RETAINED` in 0.4.4. Note that unlike
  that case, this union is consumed in an exhaustive `Record` in
  `@verbatra/studio`, so a consumer doing the same will need a new arm.

- 34f9aeb: Preserve a `.properties` file's line endings when writing it.

  The `.properties` parser accepts all three physical terminators (`\n`, `\r\n`,
  `\r`), but the serializer always joined with `\n` regardless of what the
  destination used. `.properties` is the Java and Spring format, so these files
  commonly live in CRLF repositories, where the first `verbatra translate`
  rewrote every line and turned a two-key translation change into a whole-file
  diff.

  The write now follows the destination: a file containing any CRLF is written
  back entirely with CRLF, a CR-only file with CR, and everything else, including
  a destination that does not exist yet, with LF. Comment, blank-line and
  key-order preservation are unchanged, and a value's own `\r` or `\n` is still
  escaped rather than emitted as a terminator.

- 188f2f0: Drop the positional counter from the human progress line, and make
  `locale-finished` correlatable.

  `renderProgressHuman` printed `[N/total] translating <locale>` on
  `locale-started` using the locale's index in the run's target order. The worker
  pool claims those indices up front, so at `--concurrency 3` all three lines
  printed before any work completed, showing `[1/3]`, `[2/3]` and `[3/3]` and
  then continuing past the apparent total. The line is now
  `verbatra: translating <locale>`.

  No counter replaces it, on either event. A claim ordinal rendered on a finish
  would be non-monotonic under concurrency, which is worse than no counter, and a
  true completion counter needs run-scoped state that neither the CLI nor the SDK
  should grow for a cosmetic line. A locale that has merely started was never
  progress, and the `run-finished` line still reports the total.

  This adds `localeIndex` and `totalLocales` as required members of the exported
  `LocaleFinishedEvent` on `@verbatra/sdk`, so a consumer can pair a finish with
  its start without matching on the locale name, which concurrency made necessary.
  Both are documented as correlation keys and explicitly not as progress counters.
  The behavior fixed is a defect, so the bump stays patch, but the addition to the
  public type is called out here as deliberate, following the same house policy
  recorded for `BLANK_ROW_BASELINE_RETAINED` in 0.4.4. The SDK is the only
  constructor of this event, so no consumer code needs to supply the new fields.

  `--json` is unaffected on stdout; the stderr progress records simply carry the
  two extra fields.

- 7c2e877: Validate the watch session's concurrency at startup instead of on every cycle.

  `watch()` passed `concurrency` straight through to each run and performed no
  equivalent check of its own, so a session started with a value greater than 1
  against a config that sets `maxTokens` started normally and then failed the
  initial run, and every run after it, indefinitely, with
  `CONCURRENCY_BUDGET_CONFLICT`. The same held for a concurrency that is not an
  integer of at least 1, which produced `CONCURRENCY_INVALID` per cycle.

  Both combinations are decidable from the arguments alone, so `watch()` now
  resolves them once at startup, before the watcher is created. This is a
  startup-validation improvement rather than a bug fix: the per-cycle failure was
  documented and intended, it was simply reported later and repeatedly rather than
  once and immediately.

  Note for SDK consumers: `watch()` now rejects where it previously returned a
  controller and surfaced the refusal through `onRun`. Callers that pass a
  misconfigured combination see the error at the `await watch(...)` call site. The
  CLI is unaffected in shape: `verbatra watch --concurrency 2` on a budgeted
  config already rendered the structured error and exited non-zero, and still
  does, just at startup.

## 0.6.2

### Patch Changes

- a6767a6: Harden the human-translator Excel round trip so a returned workbook is never silently misread. Import now reports the `changed` rows a translator left blank as pending (unfilled) work instead of quietly counting the locale as done, and a translation cell that holds only whitespace is treated exactly like an empty cell. A single malformed row no longer discards the rest of its sheet: the good rows still import and each bad row is reported by sheet, row number, and column (never any cell content). A duplicate key within a sheet is reported as a conflict, with the first occurrence winning deterministically. A translator can now deliberately unset a value by typing `[[CLEAR]]` in the Translation cell, which writes an empty value while keeping the key, still honoring the source-drift check. Exported workbooks lock their structure so the language tabs cannot be trivially renamed, deleted, or reordered, and on import a configured locale whose tab is missing or renamed is reported as a named, structured failure rather than silently dropped. The instructions sheet documents the new behavior, and the CLI prints the new counts and key lists.
- 62dbc7e: Add optional locale-level concurrency to the translate flow. `translate()` and `watch()` now accept an optional `concurrency` (a positive integer, surfaced on the CLI as the `--concurrency <n>` flag on `translate` and `watch`), running up to that many target locales at once through a bounded worker pool. The default is 1, which stays strictly serial and byte-identical to before: same written files, same `RunSummary.locales` order, same lock-file content. Regardless of completion order, results are always collected back into source-locale order. Because a token budget's stop guarantee is order-dependent, a live run that sets `concurrency` greater than 1 while `maxTokens` is configured is refused up front with a `CONCURRENCY_BUDGET_CONFLICT` error (a dry run is exempt); an invalid value is rejected with `CONCURRENCY_INVALID`. No new locking is added: the per-locale write locks already isolate concurrent locales on disk.
- 72bacc3: Add support for the Java/Spring `.properties` format. Files with the `.properties`
  extension are now detected and translated: keys are read flat (never split into a
  tree), the standard escapes and `\uXXXX` are decoded on read, and output is written
  canonically with `=` separators and ASCII-safe `\uXXXX` escapes for every non-ASCII
  character, so it loads under a legacy `Properties.load`. Comments, blank lines, and
  key order in an existing target file are preserved on write.

  Placeholder integrity understands the java.text.MessageFormat argument syntax these
  files are consumed through, including the typed and styled forms (`{0,number,integer}`,
  `{0,date,short}`) and the sub-message forms (`{count,plural, ...}`), so a translation
  that drops or alters an argument is caught. MessageFormat single-quote quoting is not
  interpreted: a quoted literal such as `'{0}'` is still treated as an argument. This is
  deliberate, so that an ordinary apostrophe in translated text never swallows a
  following placeholder.

- b98d7f2: Report progress during translate and watch. `translate()` and `watch()` now accept an optional `onProgress` listener that fires as a run advances: once per locale before it starts and after it finishes, once per provider sub-batch within a locale, and once when the whole run ends. As with the existing lock-wait signal, the SDK writes nothing itself; the CLI renders these events to stderr in both human and `--json` mode, so stdout stays a clean summary or NDJSON stream. A dry-run makes no provider call and so emits no sub-batch events.
- ca2d99a: Add a content-addressed translation-memory (TM) cache so a translation whose source content is unchanged is reused for free instead of being re-sent to the provider. A translation is reused even when its key was renamed, and identical source text shared across two keys is paid for once. The cache lives in a local, gitignored, regenerable `verbatra.cache.json` sibling to the lock file (scaffolded into `.gitignore` by `init`); it is never a field on the lock file and never committed.

  Each entry is keyed by `(sourceContentHash, targetLocale, fingerprint)`, nested by fingerprint under a top-level `version`. The fingerprint is a stable hash over the provider id, model, tone, and sorted glossary; format is deliberately excluded because every reused value is re-checked by the placeholder/ICU integrity gate against the current source before it is applied, so a hit that no longer matches the target format is discarded and its key falls through to the provider. Reused hits apply silently (never flagged for review). A changed fingerprint (for example a different tone) never serves a stale value.

  The cache is resilient by design: a missing, corrupt, oversized, or unrecognized-version file degrades to an empty cache and never fails a run (unlike the fatal lock-file). It is read once as an immutable snapshot at run start and written once at the end (best-effort, dry-run-skipped), which keeps it safe under locale concurrency. Values accepted by `importWorkbook`, `editEntry`, and `retranslateEntry` are also fed into the cache so a later run reuses them.

  The cache is on by default. `translate()` and `watch()` accept an optional `cache` input (surfaced on the CLI as `--no-cache`) that bypasses both the read and the write for a run, making it behave exactly as if no cache existed and leaving any existing cache file untouched. To rebuild or discard the cache, delete `verbatra.cache.json`; it is regenerated naturally on the next run. `LocaleSummary` gains a `cacheHits` bucket (rendered as "from cache" in the CLI) reporting the keys served from cache as avoided provider usage.

  Within a single run, byte-identical source text shared across two or more keys is translated once per target locale: the provider misses are deduplicated by source content hash, one representative is sent, and its accepted value is fanned out to every key that shares the content (and cached and lock-advanced identically). This holds even when the keys would otherwise fall into separate provider batches.

  Known limitation: generated plural forms are out of v1 TM scope. A synthesized CLDR plural form is neither served from nor written to the cache; only main-path diff candidates participate.

## 0.6.1

### Patch Changes

- 67f1768: Withhold degenerate machine translations at the write-path integrity gate. Output that is structurally corrupt (a repetition loop or runaway-length text) but carries no placeholders previously passed the placeholder and ICU checks and was written to disk. Such values are now detected and withheld as an integrity mismatch, so they are retried on the next run and never overwrite an existing good value. Studio surfaces the new rejection reason in its review actions.
- a90bc7e: Report a locale honestly when its keys are withheld, and retry truncated batches. A run that withheld every key for a locale previously reported it as succeeded and exited 0, so a run that produced nothing looked like a clean success in CI. Such a locale is now reported as failed and the command exits non-zero. A locale that translated some keys but withheld others is reported as partial and still exits 0, because withheld keys keep their prior state and are retried next run. The run summary gains a partial list alongside succeeded and failed. This exit-code change applies to both translate and import.

  On an OUTPUT_TRUNCATED provider error (common with reasoning models whose reasoning tokens consume the output budget), the failing sub-batch is now automatically re-split toward a single entry and retried before any key is withheld.

- 720716c: Make a contended write-lock wait visible instead of silent. When a locale's write lock is held by another run, or was left behind by a killed process, translate and watch now report that they are waiting, naming the lock file and, when it can be read, the holding process id and how long it has been held, so a blocked run no longer looks hung. A new `--lock-timeout` flag adjusts how long to wait before giving up. Lock acquisition is otherwise unchanged.
- adc9536: Bound every provider request with an abortable timeout so a hung-but-alive endpoint can no longer stall a run indefinitely. A stuck request previously held the per-locale write lock forever, blocking every later run for that locale. Requests now abort after a default of two minutes and surface a retriable timeout error, releasing the lock. Each provider accepts an optional `requestTimeoutMs` to tune the bound.

## 0.6.0

## 0.5.0

### Minor Changes

- 81dd225: A JSON, YAML, or ARB locale file that contains a stray non-string leaf, such as `"count": 5`,
  `"enabled": true`, or `"active": null`, no longer fails `translate`, `watch`, `check`, `diff`,
  `import`, or `export` for the whole file. The non-string leaf is accepted as valid file structure,
  excluded from the translatable set (never sent to a provider, hashed, diffed, or checked for
  placeholder or ICU integrity), and every sibling string key in that file is read and translated
  normally. This is a strict widening of what was previously rejected outright with
  `INVALID_STRUCTURE`. A non-string leaf is not preserved if the same file is later rewritten by
  verbatra: its path is silently absent from the output the next time that target file is written,
  since the write path rebuilds the file purely from the translatable entries. This applies to every
  JSON-family format (i18next, vue-i18n, next-intl, ngx-translate), YAML, and Flutter ARB.

  Two smaller, unrelated correctness fixes ship on the same branch. `check` and `diff` findings from
  `validate()` now sort by plain code-unit order instead of locale-sensitive `localeCompare`, so their
  order no longer depends on the host's locale and always agrees with `diff()`'s own ordering for the
  same key set. Writes to locale files are now crash-durable: the temp file is fsynced before the
  rename that makes it visible, and the containing directory is fsynced (best-effort) after, closing a
  window where a crash between the rename and disk flush could leave a target file renamed but empty
  or corrupt.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump.

- 35fe0f6: Fix the DeepL provider silently mishandling two boundary cases it never checked. First, a locale code DeepL's API does not accept (a regional source code like `en-US`, when only the base code is valid as a DeepL source; or a deprecated bare target code like `en` or `pt` that DeepL requires disambiguated) now fails fast with a structured `INVALID_REQUEST` error naming the rejected code, instead of reaching DeepL and surfacing as an opaque generic provider failure. A locale code DeepL does accept, including a title-case script subtag like `zh-Hans`, passes through unchanged.

  Second, the DeepL provider now chunks its own outgoing requests to stay within DeepL's documented per-request caps (50 texts, 128 KiB of payload), independent of and in addition to the existing `maxBatchSize` config. Previously a `maxBatchSize` above DeepL's real cap (its default of 50 happened to match, but any larger configured value did not) reached `translateText` unchunked and failed only at the provider. A sub-batch that already fits in one request is sent exactly as before; only an over-cap sub-batch is now split into multiple sequential requests and merged back transparently.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is unchanged.

- 565eb89: Move `ProviderNotice` and `ProviderNoticeCode` onto the shared `TranslateResult` type instead of
  DeepL's own extended result shape, and add an optional `notices` field to `TranslateResult` itself.
  Every provider now populates it as a present array: DeepL reports its real graceful-degradation
  notices (`FORMALITY_DOWNGRADED`, `GLOSSARY_IGNORED`, `PLACEHOLDER_UNSUPPORTED`), and every LLM
  provider (Anthropic, OpenAI, Gemini, openai-compatible) returns an empty array rather than omitting
  the field. The SDK's internal notice reader is now a plain, typed accessor over this field instead of
  a duck-typed structural cast, so a provider-side rename or shape change is now caught by the
  compiler instead of silently returning no notices.

  Also fixes DeepL's `supportsGlossary` flag, which is a behavior change worth calling out explicitly:
  it previously reported `true` unconditionally, even though DeepL only ever applies a pre-created
  native glossary id, never the SDK's generic source-term to target-term map. Supplying a term map
  without a configured native glossary id already produced a `GLOSSARY_IGNORED` notice; the flag was
  simply lying about it. `supportsGlossary` now reports `true` only when a native `glossaryId` is
  configured, and `false` for the generic term-map-only case. This is not a regression: DeepL's actual
  glossary behavior is unchanged, and nothing in the SDK gates glossary data on this flag, so a
  supplied term map still flows through to DeepL (and is still ignored with the same notice) exactly
  as before.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior
  is unchanged.

- 4c6fd52: The shared LLM layer (`runLlmTranslation`) no longer discards an entire sub-batch when the model's
  response is only partially well-formed. Previously, a response missing, duplicating, or adding a single
  key relative to what was requested failed the whole batch with `INVALID_RESPONSE`, so a 50-key sub-batch
  that came back with 49 good keys and one bad one withheld and re-paid for all 50 on the next run.

  Reconciliation now partitions a response into the well-formed keys (accepted immediately) and the keys
  missing or duplicated (neither is safe to guess at). The well-formed remainder is kept, and exactly one
  bounded repair round re-requests only the still-missing keys through the same schema-bound boundary.
  Placeholder and ICU integrity still runs on every accepted value, including one recovered in the repair
  round. A key still missing after the repair round is withheld and reported under the existing
  `providerFailures` category (nothing was translated for it), never counted as a placeholder-integrity
  mismatch, and the lock baseline advances only for keys actually accepted this run so a withheld key
  retries next time.

  An unrequested (hallucinated) key is unaffected by this change: it still fails the whole batch
  immediately, in the first response or the repair round, exactly as before. This is a reliability
  improvement, not a breaking change: `@verbatra/sdk`'s and `@verbatra/cli`'s (version-locked) public
  behavior is unchanged except that fewer whole-batch failures are observable when a provider response is
  mostly, but not perfectly, well-formed.

- 54a641a: Add a new provider id `openai-compatible` for pointing verbatra at a local or self-hosted OpenAI-compatible inference server (LM Studio, Ollama, vLLM). Configure it with `{ baseUrl, model, maxOutputTokens, apiKeyEnvVar? }`; `baseUrl` is validated as an absolute http or https URL at config-parse time, and lives in config rather than the environment since it is a network address, not a secret. It must include your server's API path segment (typically `/v1`, the same convention the underlying client already uses for the hosted `openai` provider).

  The API key still never lives in config. It resolves in three tiers: an explicitly named `apiKeyEnvVar` (throws a clear error if that variable is unset), then the new convention variable `OPENAI_COMPATIBLE_API_KEY`, then the non-secret placeholder `"local"` for servers that need no key at all. `apiKeyEnvVar` cannot name any of the four hosted providers' environment variables, and the new provider's client never reads `OPENAI_API_KEY` or shares any code path with the hosted `openai` provider, so a hosted key can never reach a custom `baseUrl`.

  The request body uses the same strict, schema-constrained response format as the hosted `openai` provider (verified against a live LM Studio server); the one difference is that this provider tolerantly extracts the first brace-balanced JSON object anywhere in the response before parsing, since a local or smaller model can still wrap an otherwise-correct answer in prose or a ```json block despite the constraint. The extraction is string-aware, so prose or Markdown fence characters before, after, or even embedded inside a translated string value never defeat it. Its output still runs through the exact same canonical schema validation and placeholder and ICU integrity checks as every other provider.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is unchanged, and `verbatra init` does not yet offer `openai-compatible` as a scaffold option (it has no single required environment variable, unlike every other provider).

- 7d50d22: `translate` and `watch` now persist each non-dry-run's review-flag and token/usage
  data to a new gitignored file, `.verbatra-local/run-status.json`, written once after
  the per-locale loop completes. A new SDK function, `runStatus`, reads it back:
  `{ available: false }` when no file exists yet or it cannot be parsed, or
  `{ available: true, version, generatedAt, usage?, budget?, locales }` when it does.
  The write is best-effort (any failure is caught and swallowed, never failing the run
  or reaching `RunSummary`) and is skipped on dry-run, mirroring the existing lock-file
  write discipline. `verbatra.lock.json` itself is unchanged.

  `verbatra init` now also scaffolds `.verbatra-local/` into a project's `.gitignore`,
  alongside the existing `.env`/`.env.local` entries.

- 400e044: Providers now classify a failed translation call by HTTP status code or SDK error class instead of collapsing every failure into one opaque error: a 429 or an equivalent rate-limit error class surfaces as `RATE_LIMITED`, a network or request timeout as `TIMEOUT`, and a 401 or 403 as `AUTH_FAILED`, with the prior generic code kept as the fallback for anything unclassified. Classification never inspects error message text, so nothing provider-specific or key-shaped can leak through it. A caller-initiated cancellation (via `AbortSignal`) is now re-thrown as an abort instead of being wrapped as a provider error, so it can be told apart from a real failure; abort detection correlates the caught error's own identity with the signal instead of trusting the signal's `aborted` flag alone, so an unrelated failure that merely coincides with the signal being aborted is still classified and redacted, never passed through raw.

  The Gemini provider now retries a transient rate limit or server error with backoff before giving up, closing a gap where a single transient failure could kill an entire translation sub-batch (the other three v1 providers already retry through their own SDKs).

  A translation request can now carry an optional cancellation signal, threaded down into each provider's underlying call where the provider's SDK supports it. This is additive: `@verbatra/sdk`'s own APIs are unchanged in behavior, and `@verbatra/cli` (version-locked with `@verbatra/sdk`) picks up the same bump with no behavior change of its own.

- 314aefa: Add `retranslateEntry`, a new sdk seam that retranslates exactly one source key into exactly one
  target locale: a single-entry provider call through the same `selectProvider` registry
  `translate()` already uses, gated through a new shared `gateCandidateValue` accept/reject check
  before anything reaches disk. On acceptance it writes the target locale file (merging only the
  requested key, leaving every other key untouched) and updates the lock entry for that key; on
  rejection it writes nothing and reports the candidate value and which check failed it. Add a new
  `UNKNOWN_KEY` error code, thrown when the requested key does not exist in the source resource.

  Also extract the placeholder and ICU integrity check that `translate()`/`watch()` and workbook
  import already ran independently into this one shared `gateCandidateValue` function, and route
  both existing call sites through it. This adds a real behavior change to `translate()`/`watch()`:
  the provider-translation path previously only compared placeholders before accepting a
  translation; it now also validates the candidate against the format's message syntax (ICU
  plural/select, for `next-intl-json` and `arb`), so a well-formed-on-placeholders but malformed ICU
  candidate is now withheld where it was previously accepted. This has no effect on non-ICU formats,
  whose message validation always passes.

  `@verbatra/cli`'s `studio` command gains one new flag, `--allow-spend`, with an environment
  variable fallback (`VERBATRA_STUDIO_ALLOW_SPEND`); the CLI flag wins when both are given. It
  defaults to off and is the only way to enable Studio's provider-calling actions, including the
  new gated retranslate action. Local editing of the project's own locale files is always
  available and needs no flag; only provider spend is gated.

  `keyIntegrity`'s per-key result gains a new `icuValid: boolean` field, computed unconditionally
  and independently of the placeholder check: a target value can now be reported as placeholder-valid
  but ICU-invalid, the exact failure the gated retranslate action exists to fix. Always true for a
  non-ICU format.

  `translate()`/`watch()` and `importWorkbook()` now serialize their writes per target locale: each
  locale's read-translate-write step, including the provider call, holds a new real, cross-process
  advisory lock for that locale before touching its target file or lock-file entry, so a concurrent
  writer for the same locale (another CLI run, a workbook import, or a Studio `retranslateEntry`
  call) can never interleave with it and silently lose a key. A new `LOCK_CONTENDED` error code is
  thrown if a locale's lock cannot be acquired within its timeout, naming the lock file's path. This
  also removes the lock-file's previous compare-and-swap retry, which left a residual race window of
  its own; mutual exclusion is now provided entirely by the new lock. A dry run never acquires a
  lock, since it never writes anything.

  Breaking change: the exported `SdkFs` interface gains two new required methods, `createExclusive`
  and `deleteFile`, backing the new lock. Any custom `SdkFs` implementation passed to `translate()`,
  `watch()`, `importWorkbook()`, or any other SDK entry point's `deps.fs` must add both, or it will
  fail to type-check and, since the new lock is now taken unconditionally on every write path, throw
  at runtime the first time a locale is written.

- 4515726: Add a new sdk function, `keyIntegrity`, that reports per changed key
  and target locale whether the format's placeholders or ICU structure
  still match between source and target: a boolean match result plus,
  on a mismatch, the specific placeholder tokens that are missing or
  extra. It reuses core's `checkPlaceholders` and an adapter's own
  `comparePlaceholders` exactly as they exist today; only "changed" keys
  are checked, since a missing or orphaned key has no value on one side
  to compare.

  Studio exposes this through a new read-only RPC method, `key.integrity`,
  scoped to exactly the one key currently open in the detail drawer,
  mirroring the existing `history.list` pattern of supplementary data
  fetched lazily on open rather than growing the already-uncapped
  `status.diff` payload. `KeyDetailDrawer` now renders an Integrity
  column with a pill: green for a match, red with the mismatched tokens
  for a mismatch, and neutral (never a false red) for a format with no
  placeholders at all. The pill reuses the existing `Badge` component
  and its success, neutral, and danger tones; no new styling is added.

  No RPC response carries a full source or target string value at any
  point, only the boolean result and, on a mismatch, the specific
  placeholder tokens involved.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the
  same bump; its own behavior is unchanged.

- ea054a2: Studio's live-refresh SSE channel now reports a real, still-content-free key delta instead of a
  blank "something changed" signal. `RefreshEvent` gains two optional fields, `locale` and `delta`
  (`added`/`changed`/`removed` counts), populated for `"source"` and `"targets"` refresh events; a
  `"lock"` event is unchanged. The `targets` watch category is now split into one chokidar watcher and
  one debounce per configured target locale, so a change to one target locale's file is distinguishable
  from a change to another, and each locale reports its own delta.

  The delta is a plain content diff of one locale file against its own last observed snapshot (taken at
  Studio startup and after every settled change), independent of source drift or the lock baseline.
  This is a deliberate semantics choice: it is the only reading under which a translator hand-editing an
  existing translation's wording, with the key itself untouched, is ever detected as a change. Two rapid
  changes to the same locale file, close enough together that the second's debounce window opens while
  the first's snapshot read is still in flight, are serialized so the second's reported delta is always
  correct against the first's settled state, never a stale or out-of-order baseline.

  `@verbatra/sdk` gains a new small read-only module, `readLocaleFileSnapshot` and
  `diffLocaleSnapshots`, exported for this purpose: reading one locale file through the configured
  adapter into a per-key content hash, and comparing two such snapshots into added/changed/removed
  counts. No translation string, key name, or file content ever crosses the SSE wire, only locale codes
  and counts.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump with no behavior
  change of its own.

- d99347a: Add `editEntry`, a new sdk seam that writes exactly one human-typed correction into exactly one
  target locale: gated through the shared `gateCandidateValue` accept/reject check before anything
  reaches disk, wrapped in `withLocaleWriteLock` across read-target through lock-update, mirroring
  `retranslateEntry`'s own critical section exactly. Unlike `retranslateEntry`, it never calls a
  provider: `EditEntryDeps` carries no `createProvider` field, so there is no path to one even if the
  seam were miswired. On acceptance it writes the target locale file (merging only the requested key)
  and updates the lock entry for that key; on rejection it writes nothing and reports the candidate
  value and which check failed it. Never writes to, or reads for the purpose of updating,
  `.verbatra-local/run-status.json`.

  Add `keyValue`, a new read-only sdk function that reads a key's current source and target value for
  exactly one target locale, live via the same `readSource`/`readTarget` calls `check`, `diff`,
  `retranslateEntry`, and `editEntry` already use. `target` is absent exactly when the key does not
  yet exist in that target locale. No provider call, no file write, no lock.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior
  is unchanged.

- dfd2b77: Developer context that Flutter ARB (`@key.description`) and XLIFF (`<note>`) already carry now
  reaches both the translation provider and the exported workbook, instead of always being blank.

  ARB reads populate `entry.description` from `@key.description` via a new post-flatten hook on the
  tree-file adapter, aligned by key with dotted literal keys. XLIFF reads populate `entry.description`
  from a trans-unit's `<note>` (or, in XLIFF 2.0, the unit's `<notes><note>`, shared by every segment in
  that unit). Neither format's write or round-trip behavior changes: the metadata is read-only context,
  never written back.

  `entry.description` already reached the AI provider payload as disambiguation context and was never
  translated or echoed; this change only makes sure the field is finally populated for these two
  formats. The exported workbook (`exportWorkbook`) gains a 7th column, `Context`, appended after
  `Source hash` so the editable `Translation` column keeps its position. It is read-only and protected
  like `Source` and `Current translation`. `importWorkbook` never reads `Context` as a translation
  source, and a workbook built before this column existed still imports successfully.

  One behavior change worth calling out: an ARB or XLIFF entry that carries a description or note will
  re-export and re-translate once on upgrade, since the lock baseline's content hash already accounts
  for `description` and now sees a value where it previously saw none. This is intentional: the newly
  surfaced context can change how the string should be translated, so it gets one reconsideration pass,
  and the baseline then stabilizes.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is
  unchanged.

- 435e048: `translate`, `watch`, and `importWorkbook` now aggregate the token usage every LLM provider already
  reports per call. `LocaleSummary.usage` and `RunSummary.usage` sum input and output tokens across
  every provider call in scope (main translation and plural generation alike); both stay `undefined`,
  never a fabricated zero, whenever nothing in that scope reported usage (a dry-run, or a token-less
  provider such as DeepL).

  A new optional config pair, `maxTokens` and `budgetBehavior` (`"warn"` or `"stop"`, default `"warn"`),
  lets a project cap or flag a run's spend. The check runs after each completed provider sub-batch, never
  mid-batch: the sub-batch whose completion crosses the ceiling is retained and counted, since a call
  already in flight cannot be undone. Under `"warn"` the run continues unchanged past the ceiling. Under
  `"stop"`, every not-yet-attempted key for the rest of the run, in the current locale and every later
  target locale, is withheld into a new `LocaleSummary.budgetWithheld` array (parallel to
  `integrityMismatches` and `providerFailures`) and retried automatically next run, exactly like a failed
  provider call today. A budget trip never fails a locale and never changes the exit code of `translate`,
  `watch`, or `import`. `RunSummary.budget` is present only when `maxTokens` is configured, including a
  `supported: false` case against a token-less provider or a dry-run, so the guardrail is visibly and
  honestly inert rather than silently omitted or falsely tripped.

  The CLI's human `translate`/`watch` summary now shows per-locale and aggregate token counts when usage
  was reported, and a budget line when a ceiling is configured. `--json` output needed no new rendering
  code: the new fields serialize automatically once populated.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump for the new rendering.

- ad431ca: Add a derived, per-key "needs review" signal for translations, distinct from the
  placeholder/ICU integrity gate: a suspiciously short or long output, a translation
  identical to the source, a missed glossary term, a placeholder set that matches but
  landed in a different order, or a batch that was gracefully degraded by the provider
  (currently DeepL only) now surfaces as a review flag instead of passing silently.

  `translate` and `watch` summaries gain a `needsReview` list of flagged keys and their
  reason codes, and `verbatra translate`/`watch`'s human output shows a `needs-review`
  count alongside `integrity-withheld` and `notices` when it is non-zero (already
  present in `--json` once the summary carries the field). The Excel export/import
  workbook gains two read-only "Review status" / "Review reasons" columns, recomputed
  fresh from the on-disk source and current target at export time; they are purely
  informational and never gate what import accepts, and importing a workbook exported
  before this change (with no such columns) is unaffected.

  This is advisory only: a review flag never withholds a translation, and there is no
  way to "clear" it other than fixing the underlying value. A workbook exported later
  from the same on-disk target does not retroactively show a `PROVIDER_DEGRADED` flag
  from an earlier run, since that fact lives only in memory during the run that
  produced it.

### Patch Changes

- a53e0c4: Deduplicate the tolerant target-locale read into a single shared helper. The export, import, and per-locale translate flows now delegate to the same implementation as diff and check, so the empty-resource shape and the file-existence check can no longer drift apart. No behavior change.
- bcd68e8: Rewrite all JSDoc from the implementation and remove non-documentation comments. Corrects stale API documentation, including the SdkError per-code thrown-by attributions, the translate() docblock attachment, and the CLI watch-session exit-code contract.
- 874cf70: Fix a raw, uncaught exceljs crash when a target locale collided, case-insensitively, with another
  target locale (for example `"de"` and `"DE"`) or with the reserved "Instructions" worksheet name
  (for example a target locale of `"instructions"`). exceljs deduplicates worksheet names
  case-insensitively inside its own `Worksheet` constructor, not in `addWorksheet`, so both cases
  previously escaped as a raw library error instead of a structured one.

  `targetLocales` is now validated at config-load time: two entries that are case-insensitively equal
  are rejected with a clear zod error naming the colliding locale, matching the existing
  source-locale-exclusion check. As defense in depth, `exportWorkbook` also rejects the same
  collisions, and a locale colliding with the reserved instructions sheet, before any worksheet is
  added, surfacing an `ExchangeError` (`WORKBOOK_INVALID`) instead of letting the exceljs error
  propagate.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior
  is unchanged.

- 14e9719: Fix ICU plural/select placeholder-integrity checking (next-intl and ARB) to compare source and target
  branch by matched branch instead of flattening each side into one multiset first. The prior flattening
  strategy dropped any placeholder confined to only some branches of a value before the comparison ever ran,
  which meant a fabricated placeholder invented in a single branch of a translated ARB or next-intl value
  (for example, only in a richer target locale's `few` or `many` CLDR category) could pass the integrity
  check undetected. The new comparison walks matched plural/select nodes branch by branch: a category present
  on both sides is checked directly, so an invention or a drop confined to one branch is caught precisely; a
  category only the target's richer cardinality supplies is checked for fabricated content against the union
  of every source branch, so a translator legitimately reusing a placeholder that appears in only one source
  branch is never wrongly rejected. This closes the gap for the LLM and DeepL provider translation paths and
  for workbook import, the two live call sites that resolve an ICU-capable format adapter.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is
  unchanged.

- 0ae2f52: Preserve document key order exactly on round-trip for the JSON-family, YAML, and ARB adapters. Integer-like keys such as "2", "10", or "404" are no longer hoisted to the front and re-sorted on read or write, so files keyed by numeric ids, HTTP status codes, or years keep their own key order, and new keys added by a translate run now append after the target's existing keys in source-document order instead of alphabetically. As part of the YAML conformance, a document using a map or sequence as a mapping key is now rejected with a structured INVALID_STRUCTURE error instead of silently collapsing to "[object Object]".
- e617c6b: Fix `exportWorkbook`'s `includeUnchanged` option labeling already up-to-date rows as `"changed"`.
  `RowStatus` gains a third value, `"unchanged"`, and rows from the unchanged diff bucket are now
  exported with that status instead of the misleading `"changed"`, which told translators the source
  string had changed and needed re-translation even though it had not. The read-side row schema
  accepts `"unchanged"` so a previously exported sheet round-trips through import without error, and
  the instructions sheet gains an honest line explaining the new status. Import behavior is
  unaffected: it already decides accept-or-withhold purely from source-hash drift, placeholder, and
  ICU checks, never from the status column.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior
  is unchanged.

- 440212e: Reject a lock-file whose `version` does not match the version this build of verbatra
  understands. `readLockFile` previously validated the lock-file's shape but never compared its
  `version` field to the current supported version, so a lock-file written by an incompatible
  future (or otherwise mismatched) verbatra build was read and reinterpreted as if it were the
  current format, then rewritten still stamped with the wrong version, silently corrupting or
  misinterpreting the recorded baselines. A version mismatch now throws the same structured
  `LOCK_FILE_INVALID` error already used for a corrupt or oversized lock-file, naming the found and
  expected version numbers.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own
  behavior is unchanged.

- 2127234: Fix the `openai-compatible` provider against Mistral and other OpenAI-compatible servers that expect `max_tokens` rather than OpenAI's newer `max_completion_tokens` field. The shared Chat Completions request builder previously hardcoded `max_completion_tokens` for every caller, including `openai-compatible`, so every request against a server that rejects that field (Mistral's chat completions API answers with HTTP 422, "Extra inputs are not permitted") failed outright. The `openai-compatible` provider now sends `max_tokens` instead, the field understood broadly across LM Studio, Ollama, vLLM, and hosted OpenAI-compatible APIs such as Mistral's; the hosted `openai` provider is unaffected and still sends `max_completion_tokens`.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is unchanged.

- 2ede9ae: Fix generated plural forms trusting the provider's self-reported `result.integrity` map instead of
  recomputing the accept/withhold decision through the shared integrity gate. Every other disk-writing
  path (the main translation run, workbook import, and manual retranslate or edit) already recomputes
  placeholder and ICU integrity directly from the candidate value rather than trusting what the provider
  claims about its own output; generated plural forms are now the same. Practical impact today is small,
  since plural-form generation only ever runs for the non-ICU i18next-json format, but a provider that
  misreports its own placeholder match can no longer slip a mismatched generated form past the check.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is
  unchanged.

- e116642: Refresh the bundled Anthropic (`@anthropic-ai/sdk`, 0.105.0 to 0.111.0), Gemini (`@google/genai`,
  2.9.0 to 2.11.0), and OpenAI (`openai`, 6.44.0 to 6.46.0) SDKs pinned in the `bundled` pnpm catalog.
  OpenAI's 6.47.0 was published the same day as this change and is deliberately left one patch behind
  current latest, to give a freshly published release a cycle to surface any issues upstream before
  verbatra bundles it.
  `@verbatra/sdk` bundles `@verbatra/ai-providers` into its published dist, so these exact versions
  ship to every consumer of `@verbatra/sdk` and `@verbatra/cli`.

  Each vendor's changelog was reviewed across the bumped range for changes on every surface this
  package touches: request construction, response parsing, and error classification. None of the
  three renamed or removed a field, response shape, or SDK error class verbatra reads (`RateLimitError`,
  `AuthenticationError`, `PermissionDeniedError`, `APIConnectionTimeoutError`, and `APIUserAbortError`
  for the two SDKs that classify by class identity; HTTP status codes for Gemini). Gemini 2.11.0's one
  refactor in range, removing `cached_content`, `presence_penalty`, and `frequency_penalty` from
  request options, is scoped to the newer Interactions API; the classic `models.generateContent` call
  this provider uses is unaffected, per the SDK's own release notes. New model IDs each vendor added in
  this range (for example claude-sonnet-5, gpt-5.6-sol) are now available to configure, since verbatra
  never restates a model allow-list of its own; it forwards whatever model id a project's config sets.

  No behavior change beyond what each vendor's own patch and minor releases carry. `@verbatra/cli` is
  version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is unchanged.

- f3fd15f: Fix reading a UTF-8 JSON or ARB translation file that starts with a leading byte-order-mark
  (U+FEFF). The shared bounded file reader decoded the raw bytes to a UTF-8 string but never
  stripped a leading BOM, so any JSON-based format (including ARB) reading a BOM-prefixed file
  failed with an `INVALID_JSON` error even though the file was otherwise valid. Exactly one leading
  BOM is now stripped once, in the shared read layer, before content ever reaches a parser; interior
  BOM characters and everything else in the file are left untouched, and the fix is bounded and
  fixed-length rather than a regex. No adapter's write path emits a BOM, so a file without one stays
  unchanged on round-trip.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own
  behavior is unchanged.

- 10a264e: Fix a duplicate-spend race in `translate()`: the lock-file was read exactly once before the
  per-locale loop, so two concurrent `translate()` calls against the same project (two CLI
  processes, or a CLI run overlapping a Studio write action) both diffed a "changed" key against
  the same stale baseline and both sent it to the provider, paying twice for the same translation.
  The lock-file is now read fresh inside each locale's own write lock on every non-dry-run call, so
  a second concurrent call blocks on that locale's real lock, then re-reads a lock-file that already
  reflects the first call's write and correctly finds nothing left to do. Dry-run is unaffected: it
  still reads the lock once, since it never writes anything to serialize against. A corrupt
  lock-file discovered on this path still aborts the whole run with `LOCK_FILE_INVALID`, matching
  `translate()`'s existing documented behavior.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump with no behavior
  change of its own.

- 2fe16b2: Harden the XLIFF adapter's XML handling. Two trans-units resolving to the same key (typically a
  duplicate `id`, or a positional fallback colliding with a real id) now raise `INVALID_STRUCTURE`
  instead of silently dropping one entry on read and misdirecting a translation to both units on
  write. The DTD and entity rejection already applied to XLIFF files on read now also applies to
  translated values before they are re-parsed as XML fragments on write, closing a gap where a
  malicious value could smuggle a DOCTYPE or entity declaration past the existing guard. Translated
  values are also filtered against an allow-list of genuine XLIFF inline elements (`x`, `g`, `bx`,
  `ex`, `ph`, `it`, `mrk`), each carrying no namespace or the genuine XLIFF 1.2/2.0 document
  namespace, and each restricted to its own minimal, non-executable set of attributes (`id`, and
  where applicable `rid`, `ctype`, `pos`, or `mtype`). A value containing any other element, an
  allow-listed element under any other namespace, a CDATA section, a comment, a processing
  instruction, or an attribute outside that element's allow-list (such as `onclick` or
  `xlink:href`) now degrades entirely to a plain text node, the same fallback already used for
  unbalanced markup, instead of reaching the written file as live markup or an unfiltered attribute.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own
  behavior is unchanged.

- b945e53: Fix the workbook decompressed-byte guard over-counting binary parts on import. The guard measured
  each entry's decompressed size by re-encoding the entry's UTF-8-decoded text with
  `Buffer.byteLength`, but decoding is lossy for a binary part (a thumbnail, embedded image, or any
  non-UTF-8 workbook part): every invalid byte becomes the replacement character U+FFFD, which is 3
  bytes wide, so the re-encoded count could overstate the true decompressed size by up to roughly 3x.
  A legitimate translated workbook carrying such a part could be wrongly rejected with a
  `WORKBOOK_INVALID` error even though it never actually exceeded the configured limit. The guard now
  sums the true raw decompressed byte count as it streams each entry, so the cap is checked against
  what the entry actually decompresses to.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior
  is unchanged.

## 0.5.0-next.4

### Minor Changes

- 81dd225: A JSON, YAML, or ARB locale file that contains a stray non-string leaf, such as `"count": 5`,
  `"enabled": true`, or `"active": null`, no longer fails `translate`, `watch`, `check`, `diff`,
  `import`, or `export` for the whole file. The non-string leaf is accepted as valid file structure,
  excluded from the translatable set (never sent to a provider, hashed, diffed, or checked for
  placeholder or ICU integrity), and every sibling string key in that file is read and translated
  normally. This is a strict widening of what was previously rejected outright with
  `INVALID_STRUCTURE`. A non-string leaf is not preserved if the same file is later rewritten by
  verbatra: its path is silently absent from the output the next time that target file is written,
  since the write path rebuilds the file purely from the translatable entries. This applies to every
  JSON-family format (i18next, vue-i18n, next-intl, ngx-translate), YAML, and Flutter ARB.

  Two smaller, unrelated correctness fixes ship on the same branch. `check` and `diff` findings from
  `validate()` now sort by plain code-unit order instead of locale-sensitive `localeCompare`, so their
  order no longer depends on the host's locale and always agrees with `diff()`'s own ordering for the
  same key set. Writes to locale files are now crash-durable: the temp file is fsynced before the
  rename that makes it visible, and the containing directory is fsynced (best-effort) after, closing a
  window where a crash between the rename and disk flush could leave a target file renamed but empty
  or corrupt.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump.

- 435e048: `translate`, `watch`, and `importWorkbook` now aggregate the token usage every LLM provider already
  reports per call. `LocaleSummary.usage` and `RunSummary.usage` sum input and output tokens across
  every provider call in scope (main translation and plural generation alike); both stay `undefined`,
  never a fabricated zero, whenever nothing in that scope reported usage (a dry-run, or a token-less
  provider such as DeepL).

  A new optional config pair, `maxTokens` and `budgetBehavior` (`"warn"` or `"stop"`, default `"warn"`),
  lets a project cap or flag a run's spend. The check runs after each completed provider sub-batch, never
  mid-batch: the sub-batch whose completion crosses the ceiling is retained and counted, since a call
  already in flight cannot be undone. Under `"warn"` the run continues unchanged past the ceiling. Under
  `"stop"`, every not-yet-attempted key for the rest of the run, in the current locale and every later
  target locale, is withheld into a new `LocaleSummary.budgetWithheld` array (parallel to
  `integrityMismatches` and `providerFailures`) and retried automatically next run, exactly like a failed
  provider call today. A budget trip never fails a locale and never changes the exit code of `translate`,
  `watch`, or `import`. `RunSummary.budget` is present only when `maxTokens` is configured, including a
  `supported: false` case against a token-less provider or a dry-run, so the guardrail is visibly and
  honestly inert rather than silently omitted or falsely tripped.

  The CLI's human `translate`/`watch` summary now shows per-locale and aggregate token counts when usage
  was reported, and a budget line when a ceiling is configured. `--json` output needed no new rendering
  code: the new fields serialize automatically once populated.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump for the new rendering.

- ad431ca: Add a derived, per-key "needs review" signal for translations, distinct from the
  placeholder/ICU integrity gate: a suspiciously short or long output, a translation
  identical to the source, a missed glossary term, a placeholder set that matches but
  landed in a different order, or a batch that was gracefully degraded by the provider
  (currently DeepL only) now surfaces as a review flag instead of passing silently.

  `translate` and `watch` summaries gain a `needsReview` list of flagged keys and their
  reason codes, and `verbatra translate`/`watch`'s human output shows a `needs-review`
  count alongside `integrity-withheld` and `notices` when it is non-zero (already
  present in `--json` once the summary carries the field). The Excel export/import
  workbook gains two read-only "Review status" / "Review reasons" columns, recomputed
  fresh from the on-disk source and current target at export time; they are purely
  informational and never gate what import accepts, and importing a workbook exported
  before this change (with no such columns) is unaffected.

  This is advisory only: a review flag never withholds a translation, and there is no
  way to "clear" it other than fixing the underlying value. A workbook exported later
  from the same on-disk target does not retroactively show a `PROVIDER_DEGRADED` flag
  from an earlier run, since that fact lives only in memory during the run that
  produced it.

## 0.5.0-next.3

### Minor Changes

- 35fe0f6: Fix the DeepL provider silently mishandling two boundary cases it never checked. First, a locale code DeepL's API does not accept (a regional source code like `en-US`, when only the base code is valid as a DeepL source; or a deprecated bare target code like `en` or `pt` that DeepL requires disambiguated) now fails fast with a structured `INVALID_REQUEST` error naming the rejected code, instead of reaching DeepL and surfacing as an opaque generic provider failure. A locale code DeepL does accept, including a title-case script subtag like `zh-Hans`, passes through unchanged.

  Second, the DeepL provider now chunks its own outgoing requests to stay within DeepL's documented per-request caps (50 texts, 128 KiB of payload), independent of and in addition to the existing `maxBatchSize` config. Previously a `maxBatchSize` above DeepL's real cap (its default of 50 happened to match, but any larger configured value did not) reached `translateText` unchunked and failed only at the provider. A sub-batch that already fits in one request is sent exactly as before; only an over-cap sub-batch is now split into multiple sequential requests and merged back transparently.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is unchanged.

- dfd2b77: Developer context that Flutter ARB (`@key.description`) and XLIFF (`<note>`) already carry now
  reaches both the translation provider and the exported workbook, instead of always being blank.

  ARB reads populate `entry.description` from `@key.description` via a new post-flatten hook on the
  tree-file adapter, aligned by key with dotted literal keys. XLIFF reads populate `entry.description`
  from a trans-unit's `<note>` (or, in XLIFF 2.0, the unit's `<notes><note>`, shared by every segment in
  that unit). Neither format's write or round-trip behavior changes: the metadata is read-only context,
  never written back.

  `entry.description` already reached the AI provider payload as disambiguation context and was never
  translated or echoed; this change only makes sure the field is finally populated for these two
  formats. The exported workbook (`exportWorkbook`) gains a 7th column, `Context`, appended after
  `Source hash` so the editable `Translation` column keeps its position. It is read-only and protected
  like `Source` and `Current translation`. `importWorkbook` never reads `Context` as a translation
  source, and a workbook built before this column existed still imports successfully.

  One behavior change worth calling out: an ARB or XLIFF entry that carries a description or note will
  re-export and re-translate once on upgrade, since the lock baseline's content hash already accounts
  for `description` and now sees a value where it previously saw none. This is intentional: the newly
  surfaced context can change how the string should be translated, so it gets one reconsideration pass,
  and the baseline then stabilizes.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is
  unchanged.

### Patch Changes

- 874cf70: Fix a raw, uncaught exceljs crash when a target locale collided, case-insensitively, with another
  target locale (for example `"de"` and `"DE"`) or with the reserved "Instructions" worksheet name
  (for example a target locale of `"instructions"`). exceljs deduplicates worksheet names
  case-insensitively inside its own `Worksheet` constructor, not in `addWorksheet`, so both cases
  previously escaped as a raw library error instead of a structured one.

  `targetLocales` is now validated at config-load time: two entries that are case-insensitively equal
  are rejected with a clear zod error naming the colliding locale, matching the existing
  source-locale-exclusion check. As defense in depth, `exportWorkbook` also rejects the same
  collisions, and a locale colliding with the reserved instructions sheet, before any worksheet is
  added, surfacing an `ExchangeError` (`WORKBOOK_INVALID`) instead of letting the exceljs error
  propagate.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior
  is unchanged.

- e617c6b: Fix `exportWorkbook`'s `includeUnchanged` option labeling already up-to-date rows as `"changed"`.
  `RowStatus` gains a third value, `"unchanged"`, and rows from the unchanged diff bucket are now
  exported with that status instead of the misleading `"changed"`, which told translators the source
  string had changed and needed re-translation even though it had not. The read-side row schema
  accepts `"unchanged"` so a previously exported sheet round-trips through import without error, and
  the instructions sheet gains an honest line explaining the new status. Import behavior is
  unaffected: it already decides accept-or-withhold purely from source-hash drift, placeholder, and
  ICU checks, never from the status column.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior
  is unchanged.

## 0.5.0-next.2

### Minor Changes

- 565eb89: Move `ProviderNotice` and `ProviderNoticeCode` onto the shared `TranslateResult` type instead of
  DeepL's own extended result shape, and add an optional `notices` field to `TranslateResult` itself.
  Every provider now populates it as a present array: DeepL reports its real graceful-degradation
  notices (`FORMALITY_DOWNGRADED`, `GLOSSARY_IGNORED`, `PLACEHOLDER_UNSUPPORTED`), and every LLM
  provider (Anthropic, OpenAI, Gemini, openai-compatible) returns an empty array rather than omitting
  the field. The SDK's internal notice reader is now a plain, typed accessor over this field instead of
  a duck-typed structural cast, so a provider-side rename or shape change is now caught by the
  compiler instead of silently returning no notices.

  Also fixes DeepL's `supportsGlossary` flag, which is a behavior change worth calling out explicitly:
  it previously reported `true` unconditionally, even though DeepL only ever applies a pre-created
  native glossary id, never the SDK's generic source-term to target-term map. Supplying a term map
  without a configured native glossary id already produced a `GLOSSARY_IGNORED` notice; the flag was
  simply lying about it. `supportsGlossary` now reports `true` only when a native `glossaryId` is
  configured, and `false` for the generic term-map-only case. This is not a regression: DeepL's actual
  glossary behavior is unchanged, and nothing in the SDK gates glossary data on this flag, so a
  supplied term map still flows through to DeepL (and is still ignored with the same notice) exactly
  as before.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior
  is unchanged.

- 4c6fd52: The shared LLM layer (`runLlmTranslation`) no longer discards an entire sub-batch when the model's
  response is only partially well-formed. Previously, a response missing, duplicating, or adding a single
  key relative to what was requested failed the whole batch with `INVALID_RESPONSE`, so a 50-key sub-batch
  that came back with 49 good keys and one bad one withheld and re-paid for all 50 on the next run.

  Reconciliation now partitions a response into the well-formed keys (accepted immediately) and the keys
  missing or duplicated (neither is safe to guess at). The well-formed remainder is kept, and exactly one
  bounded repair round re-requests only the still-missing keys through the same schema-bound boundary.
  Placeholder and ICU integrity still runs on every accepted value, including one recovered in the repair
  round. A key still missing after the repair round is withheld and reported under the existing
  `providerFailures` category (nothing was translated for it), never counted as a placeholder-integrity
  mismatch, and the lock baseline advances only for keys actually accepted this run so a withheld key
  retries next time.

  An unrequested (hallucinated) key is unaffected by this change: it still fails the whole batch
  immediately, in the first response or the repair round, exactly as before. This is a reliability
  improvement, not a breaking change: `@verbatra/sdk`'s and `@verbatra/cli`'s (version-locked) public
  behavior is unchanged except that fewer whole-batch failures are observable when a provider response is
  mostly, but not perfectly, well-formed.

### Patch Changes

- 2127234: Fix the `openai-compatible` provider against Mistral and other OpenAI-compatible servers that expect `max_tokens` rather than OpenAI's newer `max_completion_tokens` field. The shared Chat Completions request builder previously hardcoded `max_completion_tokens` for every caller, including `openai-compatible`, so every request against a server that rejects that field (Mistral's chat completions API answers with HTTP 422, "Extra inputs are not permitted") failed outright. The `openai-compatible` provider now sends `max_tokens` instead, the field understood broadly across LM Studio, Ollama, vLLM, and hosted OpenAI-compatible APIs such as Mistral's; the hosted `openai` provider is unaffected and still sends `max_completion_tokens`.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is unchanged.

- f3fd15f: Fix reading a UTF-8 JSON or ARB translation file that starts with a leading byte-order-mark
  (U+FEFF). The shared bounded file reader decoded the raw bytes to a UTF-8 string but never
  stripped a leading BOM, so any JSON-based format (including ARB) reading a BOM-prefixed file
  failed with an `INVALID_JSON` error even though the file was otherwise valid. Exactly one leading
  BOM is now stripped once, in the shared read layer, before content ever reaches a parser; interior
  BOM characters and everything else in the file are left untouched, and the fix is bounded and
  fixed-length rather than a regex. No adapter's write path emits a BOM, so a file without one stays
  unchanged on round-trip.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own
  behavior is unchanged.

## 0.5.0-next.1

### Minor Changes

- 54a641a: Add a new provider id `openai-compatible` for pointing verbatra at a local or self-hosted OpenAI-compatible inference server (LM Studio, Ollama, vLLM). Configure it with `{ baseUrl, model, maxOutputTokens, apiKeyEnvVar? }`; `baseUrl` is validated as an absolute http or https URL at config-parse time, and lives in config rather than the environment since it is a network address, not a secret. It must include your server's API path segment (typically `/v1`, the same convention the underlying client already uses for the hosted `openai` provider).

  The API key still never lives in config. It resolves in three tiers: an explicitly named `apiKeyEnvVar` (throws a clear error if that variable is unset), then the new convention variable `OPENAI_COMPATIBLE_API_KEY`, then the non-secret placeholder `"local"` for servers that need no key at all. `apiKeyEnvVar` cannot name any of the four hosted providers' environment variables, and the new provider's client never reads `OPENAI_API_KEY` or shares any code path with the hosted `openai` provider, so a hosted key can never reach a custom `baseUrl`.

  The request body uses the same strict, schema-constrained response format as the hosted `openai` provider (verified against a live LM Studio server); the one difference is that this provider tolerantly extracts the first brace-balanced JSON object anywhere in the response before parsing, since a local or smaller model can still wrap an otherwise-correct answer in prose or a ```json block despite the constraint. The extraction is string-aware, so prose or Markdown fence characters before, after, or even embedded inside a translated string value never defeat it. Its output still runs through the exact same canonical schema validation and placeholder and ICU integrity checks as every other provider.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is unchanged, and `verbatra init` does not yet offer `openai-compatible` as a scaffold option (it has no single required environment variable, unlike every other provider).

- 400e044: Providers now classify a failed translation call by HTTP status code or SDK error class instead of collapsing every failure into one opaque error: a 429 or an equivalent rate-limit error class surfaces as `RATE_LIMITED`, a network or request timeout as `TIMEOUT`, and a 401 or 403 as `AUTH_FAILED`, with the prior generic code kept as the fallback for anything unclassified. Classification never inspects error message text, so nothing provider-specific or key-shaped can leak through it. A caller-initiated cancellation (via `AbortSignal`) is now re-thrown as an abort instead of being wrapped as a provider error, so it can be told apart from a real failure; abort detection correlates the caught error's own identity with the signal instead of trusting the signal's `aborted` flag alone, so an unrelated failure that merely coincides with the signal being aborted is still classified and redacted, never passed through raw.

  The Gemini provider now retries a transient rate limit or server error with backoff before giving up, closing a gap where a single transient failure could kill an entire translation sub-batch (the other three v1 providers already retry through their own SDKs).

  A translation request can now carry an optional cancellation signal, threaded down into each provider's underlying call where the provider's SDK supports it. This is additive: `@verbatra/sdk`'s own APIs are unchanged in behavior, and `@verbatra/cli` (version-locked with `@verbatra/sdk`) picks up the same bump with no behavior change of its own.

### Patch Changes

- 14e9719: Fix ICU plural/select placeholder-integrity checking (next-intl and ARB) to compare source and target
  branch by matched branch instead of flattening each side into one multiset first. The prior flattening
  strategy dropped any placeholder confined to only some branches of a value before the comparison ever ran,
  which meant a fabricated placeholder invented in a single branch of a translated ARB or next-intl value
  (for example, only in a richer target locale's `few` or `many` CLDR category) could pass the integrity
  check undetected. The new comparison walks matched plural/select nodes branch by branch: a category present
  on both sides is checked directly, so an invention or a drop confined to one branch is caught precisely; a
  category only the target's richer cardinality supplies is checked for fabricated content against the union
  of every source branch, so a translator legitimately reusing a placeholder that appears in only one source
  branch is never wrongly rejected. This closes the gap for the LLM and DeepL provider translation paths and
  for workbook import, the two live call sites that resolve an ICU-capable format adapter.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is
  unchanged.

- 440212e: Reject a lock-file whose `version` does not match the version this build of verbatra
  understands. `readLockFile` previously validated the lock-file's shape but never compared its
  `version` field to the current supported version, so a lock-file written by an incompatible
  future (or otherwise mismatched) verbatra build was read and reinterpreted as if it were the
  current format, then rewritten still stamped with the wrong version, silently corrupting or
  misinterpreting the recorded baselines. A version mismatch now throws the same structured
  `LOCK_FILE_INVALID` error already used for a corrupt or oversized lock-file, naming the found and
  expected version numbers.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own
  behavior is unchanged.

- 2fe16b2: Harden the XLIFF adapter's XML handling. Two trans-units resolving to the same key (typically a
  duplicate `id`, or a positional fallback colliding with a real id) now raise `INVALID_STRUCTURE`
  instead of silently dropping one entry on read and misdirecting a translation to both units on
  write. The DTD and entity rejection already applied to XLIFF files on read now also applies to
  translated values before they are re-parsed as XML fragments on write, closing a gap where a
  malicious value could smuggle a DOCTYPE or entity declaration past the existing guard. Translated
  values are also filtered against an allow-list of genuine XLIFF inline elements (`x`, `g`, `bx`,
  `ex`, `ph`, `it`, `mrk`), each carrying no namespace or the genuine XLIFF 1.2/2.0 document
  namespace, and each restricted to its own minimal, non-executable set of attributes (`id`, and
  where applicable `rid`, `ctype`, `pos`, or `mtype`). A value containing any other element, an
  allow-listed element under any other namespace, a CDATA section, a comment, a processing
  instruction, or an attribute outside that element's allow-list (such as `onclick` or
  `xlink:href`) now degrades entirely to a plain text node, the same fallback already used for
  unbalanced markup, instead of reaching the written file as live markup or an unfiltered attribute.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own
  behavior is unchanged.

- b945e53: Fix the workbook decompressed-byte guard over-counting binary parts on import. The guard measured
  each entry's decompressed size by re-encoding the entry's UTF-8-decoded text with
  `Buffer.byteLength`, but decoding is lossy for a binary part (a thumbnail, embedded image, or any
  non-UTF-8 workbook part): every invalid byte becomes the replacement character U+FFFD, which is 3
  bytes wide, so the re-encoded count could overstate the true decompressed size by up to roughly 3x.
  A legitimate translated workbook carrying such a part could be wrongly rejected with a
  `WORKBOOK_INVALID` error even though it never actually exceeded the configured limit. The guard now
  sums the true raw decompressed byte count as it streams each entry, so the cap is checked against
  what the entry actually decompresses to.

  `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior
  is unchanged.

## 0.5.0-next.0

### Minor Changes

- 5597f98: Add support for `glossary` as a path to a JSON file, in addition to the existing inline object. A relative path resolves against the directory of the loaded config file (or against the working directory when the config is passed as an in-memory override). The file is read once at load time, bounded to 1 MiB, and validated to the same flat string-to-string shape as the inline form; a missing file, oversized file, non-UTF-8 content, invalid JSON, or the wrong shape is a config error naming the resolved path. This is config-loading only: every downstream consumer (the translation flow, `watch`, the CLI) keeps receiving the same resolved plain object it always did.

  This also adds an additive `loadConfigWithMeta` export that returns the resolved config alongside where it was loaded from and where its glossary came from, and exports the as-authored `VerbatraConfigInput` type (used by `defineConfig`) alongside the existing resolved `VerbatraConfig` type. `loadConfig` itself is unchanged in signature and behavior. `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is unchanged.

- 4a789ff: Add `lockState`, a read-only sibling of `check` and `diff` that reports the translation lock-file's existence, version, and per-locale drift (recorded key count plus missing, stale, and up-to-date counts against the current source and target files) without calling a provider, writing any file, or touching the lock. Its `exists` field is always the result of an explicit check for the lock-file on disk, so a project that has never been translated is reported distinctly from one whose lock-file is present but empty.

  Also export `loadLockFile`, a thin wrapper for reading the project's lock-file directly, along with the `LockFile` type and the `LOCK_FILE_NAME` constant. `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is unchanged.

## 0.4.4

### Patch Changes

- 8591e82: Fix the ARB adapter silently erasing all `@`-prefixed metadata (`@@locale`, and every `@key` description and placeholder block) when the destination file existed but could not be parsed. A destination write used to treat "file missing" (a legitimate first write) and "file present but corrupt, too large, or the wrong shape" identically, discarding metadata in both cases with no error. A missing destination still writes messages only, as before. A destination that exists but is not a usable ARB object now throws a structured error instead of silently proceeding, so a merge-conflicted or half-edited ARB file is surfaced as an error rather than causing silent metadata loss on the next translate run. The change lives in the private `@verbatra/format-adapters` package, so the observable behavior surfaces through `@verbatra/sdk` (and `@verbatra/cli`, version-locked).
- 43e3dbe: Fix `importWorkbook` advancing a locale's lock baseline for a changed key whose workbook cell was left blank, which permanently hid drift from `check` and `diff`.

  Previously, a changed source key with an empty translation cell fell through the row classification unresolved (neither accepted nor withheld), and the lock baseline was still advanced to the current source hash. The target file kept the translation of the old source, but `check` and `diff` reported the locale as in sync forever.

  Now only keys actually accepted this run advance their lock baseline. Every other source-present key, including a row left blank on a changed key, keeps its prior baseline hash so drift keeps being reported until the row is filled or the source reverts. This applies uniformly to a single blank row and to an entirely blank workbook across every locale.

  This adds `BLANK_ROW_BASELINE_RETAINED` as an additive member of the exported `SdkNoticeCode` union on `@verbatra/sdk`. A locale summary that retains a baseline this way now carries a notice with that code. The behavior fixed is a defect, so the bump stays patch, but the addition to the public type is called out here as deliberate.

- 714324f: Fix ICU plural and select placeholders being counted once per branch instead of once per argument, which rejected correct translations into languages with more CLDR plural categories than the source. English plural messages have one/other (2 branches), but Polish requires one/few/many/other (4) and Arabic requires zero/one/two/few/many/other (6); a correctly translated argument repeated in every required branch used to inflate the placeholder count and trip a false placeholder-integrity mismatch. A placeholder present in every branch of a plural or select now counts as one argument regardless of branch count, while a placeholder missing from any branch (a genuine translation drop) and a placeholder invented in the translation still fail integrity as before. The change lives in the private `@verbatra/format-adapters` package (the ICU analyzer used by the next-intl and ARB adapters), so the observable behavior surfaces through `@verbatra/sdk` (and `@verbatra/cli`, version-locked).
- f3f47ad: Fix the ngx-translate path-notation flatten silently dropping or restructuring translations on a
  key collision. A dotted flat key (`"a.b": "value"`) and a nested path (`"a": { "b": "value" }`)
  that resolved to the same final path used to silently overwrite each other during a read, losing
  one of the two values with no error; the flatten step now throws a structured `INVALID_STRUCTURE`
  error instead. Separately, a nested object key that itself contains a literal dot (for example
  `"a.b": { "c": "value" }`) used to write back restructured or merged with an unrelated key, since
  the dot inside the object key was indistinguishable from a path separator; such a file is now
  rejected as `MIXED_STRUCTURE` before any flattening happens. The literal-leaf adapters (i18next,
  vue-i18n, next-intl) already rejected the equivalent collision; ngx-translate now has the same
  guarantee. The change lives in the private `@verbatra/format-adapters` package, so the observable
  behavior surfaces through `@verbatra/sdk` (and `@verbatra/cli`, version-locked).
- e8a1e1d: Fix Excel translation cells being type-coerced on import. The Translation column produced by `exportWorkbook` (and the SDK's workbook export) now carries an explicit text number format, so Excel treats whatever a translator types as literal text. Previously the column had no number format, so Excel's default "General" format silently coerced typed values: a leading-zero code like "007" lost its zero, a decimal like "1.10" lost its trailing zero, a value like "3/4" was reformatted as a date, a long numeric id lost precision or turned into scientific notation, and a value starting with "=", "+", "-", or "@" (for example a phone number or a note) was parsed as a formula and imported as its formula result or an error string instead of the intended text.
- 75f54cb: Fix plural-form generation ignoring maxBatchSize and one failure discarding a whole locale run. Stale plural-generation items are now split into sequential sub-batches no larger than maxBatchSize, matching main translation batching. A sub-batch whose provider call throws now withholds only its own forms instead of aborting the locale run, so already-accepted main translations and other successful plural sub-batches are written as before.
- d119616: Stop reporting a failed provider call as an integrity mismatch. When a translation sub-batch throws (for example a revoked API key, a rate limit, or a network timeout), the run now reports the affected keys under a new `providerFailures` bucket on the per-locale summary instead of folding them into `integrityMismatches`, which is documented as "translated keys that failed the placeholder-integrity check" and is misleading here since nothing was translated. The `SUB_BATCH_FAILED` notice for that sub-batch now also carries the caught failure's code and message when it is a genuine `ProviderError` (secret-free by construction); any other thrown value still falls back to a static, generic message so nothing unvetted can leak through.

  This adds `providerFailures` as an additive member of the exported `LocaleSummary` type on `@verbatra/sdk`. The behavior fixed is a defect, so the bump stays patch, but the addition to the public type is called out here so it is deliberate. `@verbatra/cli` is version-locked with `@verbatra/sdk` and picks up the same bump; its own behavior is unchanged.

## 0.4.3

### Patch Changes

- 0470883: Accept reordered placeholders that carry the same multiset instead of withholding them as integrity failures. Translations that legitimately reorder placeholders for a target language (for example German, Japanese, or Arabic word order) are now written on every path (LLM and DeepL runs, plural-form generation, and workbook import) rather than being rejected and re-attempted on each run.
- 55fc543: Harden workbook import against a maliciously crafted archive. The importer behind `verbatra import` (and the SDK `importWorkbook`) now streams each archive entry through a memory-bounded reader and stops as soon as the decompressed size passes the configured limit, so a high-ratio compressed workbook is rejected with a clear error instead of exhausting memory. Previously such a workbook could be fully inflated before the size check ran, which could exhaust process memory when importing an untrusted file.
- 3b6d79f: Stop DeepL from burning quota looping on placeholder-bearing strings. DeepL cannot preserve placeholders or ICU tokens, so entries that contain them are now left untranslated (withheld) instead of being sent to DeepL, mangled, and re-attempted on every run. Such entries are reported through a new `PLACEHOLDER_UNSUPPORTED` notice; use an LLM provider to translate placeholder-bearing strings. Placeholder-free strings translate exactly as before. The change lives in the private `@verbatra/ai-providers` package, so the observable behavior change surfaces through `@verbatra/sdk` (and `@verbatra/cli`, version-locked). The new `PLACEHOLDER_UNSUPPORTED` code is an additive member of the provider notice-code union, reachable on the public type surface through the exported `LocaleNotice` type (the per-locale `notices` on a `RunSummary`). The fix is a defect fix so the bump stays patch, but the addition to the public type is called out here so it is deliberate.
- c525929: Fix a false green in the CI drift gates: `check`, `diff`, and `export` now reject an empty or unknown `--locales` value instead of silently exiting 0.

  A `--locales` value that normalizes to an empty list (for example `""` or `","`) is now a usage error that exits 2, and a requested locale that is not among the configured target locales is rejected as a whole-run error naming the unknown locale(s) rather than being silently dropped.

  This adds `UNKNOWN_LOCALE` as an additive member of the exported `SdkErrorCode` union on `@verbatra/sdk`. The behavior fixed is a defect, so the bump stays patch, but the new code is called out here so the addition to the public type is deliberate.

## 0.4.2

### Patch Changes

- 2ac8ad6: Remediate open npm audit advisories with pnpm overrides. Lifts the transitive uuid copy bundled through exceljs to >=11.1.1 (GHSA-w5hq-g745-h8pq) on the published path, and the dev-only js-yaml (GHSA-h67p-54hq-rp68, to the patched v3 line) and esbuild (GHSA-g7r4-m6w7-qqqr) copies. No source or public API change; this records the change to the resolved dependency tree of the published packages.

## 0.4.1

### Patch Changes

- 792c889: Fix `defineConfig` and config authoring failing to typecheck in consumer projects. The published `.d.ts` files imported unpublished `@verbatra/*` internals that do not exist in a consumer install, so the provider model types degraded to `never` and every `defineConfig` call failed with TS2769. The SDK declaration build now inlines those private workspace types, so the published declarations no longer reference `@verbatra/core`, `@verbatra/ai-providers`, or `@verbatra/format-adapters`. `defineConfig` now typechecks for every provider id with per-provider model autocomplete preserved.

## 0.4.0

### Minor Changes

- 6dc983c: Add a read-only `check` command and the matching SDK `check()` surface. `verbatra check` reports, per target locale, how many keys are missing (present in the source, absent from the target), how many are stale (the source changed since the target was last translated), and how many are up to date. It calls no provider, needs no API key, writes no files, and never touches the lock.

  Exit codes make it CI-friendly: `0` when every locale is in sync, `1` when at least one locale has a missing or stale key (the full per-locale report is still printed), and `2` when the run could not start (a structured error to stderr, with stdout left clean for `--json` piping). Flags mirror the other commands: `--cwd`, `--config`, `--locales`, and `--json` (the JSON form is the SDK `CheckSummary` verbatim).

  The SDK exposes `check(input, deps?)` returning a `CheckSummary` of `{ inSync, locales }`, where each `LocaleCheckSummary` carries `{ locale, missing, stale, upToDate, inSync }`. It reuses the existing source read, adapter selection, lock baseline, and core `diffResources`, so there is one definition of drift in the codebase.

- 986d832: Add a read-only `diff` command and the matching SDK `diff()` surface, the detailed sibling of `check`. Where `check` reports per-locale counts, `verbatra diff` reports the actual keys: per target locale it lists the keys that would be added (missing from the target), the keys that would be re-translated (the source changed since the target was last translated), and the keys that are orphaned (present in the target, absent from the source). It calls no provider, needs no API key, writes no files, and never touches the lock.

  Exit codes make it CI-friendly: `0` when no locale has pending changes, `1` when at least one locale has a missing or changed key (the full per-locale report is still printed first), and `2` when the run could not start (a structured error to stderr, with stdout left clean for `--json` piping). Orphaned keys are always reported but never on their own flip the exit code, because a default `translate` run does not prune. Flags mirror the other commands: `--cwd`, `--config`, `--locales`, and `--json` (the JSON form is the SDK `DiffSummary` verbatim, with the full key lists).

  The SDK exposes `diff(input, deps?)` returning a `DiffSummary` of `{ hasPendingChanges, locales }`, where each `LocaleDiff` carries `{ locale, missing, changed, orphaned, hasPendingChanges }`. Internally, `check` and `diff` now share a single read-plus-diff orchestration over the existing source read, adapter selection, lock baseline, and core `diffResources`, so there is one definition of drift in the codebase. The `check` public contract is unchanged.

- b0a558f: Add three new format adapters: XLIFF, YAML, and Flutter ARB. verbatra can now point at XLIFF (`.xlf`, `.xliff`), YAML (`.yml`, `.yaml`), and ARB (`.arb`) locale files in the same translate and watch flows, with no change to how the tool is run. Select a new format through the existing config `format` key; the SDK and CLI pick the adapters up through the registry automatically.

  - XLIFF: parses XLIFF 1.2 (file/body/trans-unit) and 2.0 (file/unit/segment), reading the target over the source. Writes update the target in place, leaving the source, every attribute, and every note untouched so they round-trip. A missing destination is rejected with a structured error, because source, target, and attributes cannot be synthesized from a flat key/value map (standard tooling seeds the target file first).
  - YAML: a nested tree like JSON in YAML syntax, with i18next-compatible `{{double-brace}}` interpolation. Anchor-alias expansion is bounded against billion-laughs input, and non-object roots and non-string leaves are rejected.
  - ARB: JSON-based Flutter resource bundles. `@`-prefixed metadata keys are preserved and round-tripped in document order, never sent for translation. Message values are ICU MessageFormat, so placeholders, plurals, and message validity reuse the shared ICU analysis.

  Internally, the JSON adapter factory is generalized into a shared tree-file factory (hosting the JSON family, ARB, and YAML) plus a small flat-file factory (XLIFF), both reusing the same bounded read, structured errors, and atomic write. The four existing JSON adapters are unchanged. Two runtime dependencies are added to `@verbatra/sdk`: `yaml` and `@xmldom/xmldom`, both with permissive licenses and no native bindings.

### Patch Changes

- 86d7fcb: Centralize the CLI `init` lookup tables behind an SDK scaffolding-metadata surface and consolidate the one-shot whole-run error scaffold. This is a behavior-preserving refactor: the scaffolded `verbatra.config.ts`, `.env.example`, and `.gitignore` bytes are identical, and every command exit code (`0`, `1`, `2`, `130`) is unchanged.

  `@verbatra/sdk` gains one additive, read-only export, `scaffoldingMetadata` (provider id to env var, LLM provider id to a cosmetic default scaffold model, and the supported format ids), plus a re-exported `SupportedFormat` type. The values are sourced from `@verbatra/core` (format ids) and `@verbatra/ai-providers` (provider env vars and scaffold models); the SDK assembles a pass-through and owns no copy. A `Record<ProviderId, string>` compile guard ties the env-var table to the canonical provider union.

  The CLI `init` command now reads provider ids, env-var names, and default models from `scaffoldingMetadata` instead of hand-maintained local tables, so a provider, env-var, model, or format-id change in a lower package breaks the CLI build instead of silently drifting. The `FORMAT_BY_DEP` npm-dependency-to-format detection map stays CLI-local by design, with its format ids typed against `SupportedFormat`. The repeated load-config plus try/catch plus `return 2` scaffold in `runTranslate`, `runExport`, `runImport`, `runCheck`, and `runDiff` is consolidated into one `withWholeRunErrors` helper; `runWatch` keeps its own streaming error model and the `130` force-stop path.

  The new SDK export is internal-facing and the change is behavior-preserving, so this is a patch on the version-locked `sdk` and `cli` pair. The private `core` and `ai-providers` packages ship no changeset.

## 0.3.0

### Minor Changes

- 4fd6165: feat(sdk): warn on missing CLDR plural categories, with opt-in generation (`generatePlurals`)

  When a target language requires more CLDR plural categories than the i18next source supplies (for
  example Arabic, Polish, or Russian against an English one/other source), verbatra emits a per-locale
  `PLURAL_CATEGORIES_INCOMPLETE` notice naming the locale and the missing categories; the run still
  succeeds. Opt-in `generatePlurals` makes verbatra synthesize the missing target forms so the written
  plural set is complete, instead of only warning. This is off by default: enable it with a
  `generatePlurals: true` config option or a per-run `generatePlurals` override (the override takes
  precedence), mirroring the `prune` pattern.

  Generation is supported for i18next-JSON projects translated by an LLM provider only. DeepL,
  non-i18next formats, and target languages not in the static category lookup fall back to the existing
  `PLURAL_CATEGORIES_INCOMPLETE` warning and never hard-fail. Generated forms ride the existing provider
  path: the source plural value travels in the data channel and the CLDR category travels as data context
  (meaning), so the prompt-injection boundary is unchanged and no provider request shape or schema changes.
  Each generated form is placeholder/ICU integrity-checked like any translation; a failing form is withheld
  (surfaced in `integrityMismatches`) and keeps the warning. Generated keys are tracked in the lock by a
  hash of their governing source plural forms (not regenerated while those are unchanged, reconsidered when
  they change, retried when withheld) and are surfaced on the run summary as a new `generated` field,
  distinct from `translated`. The warning is suppressed only when a supported case produced a complete,
  integrity-passing set.

  The CLI surfaces this on its default human output: the per-locale line now shows a `generated` count
  (only when non-zero, matching how `orphaned` and `pruned` are shown), so a user not using `--json` sees
  when plural forms were synthesized. The JSON and NDJSON output already carried the `generated` field
  verbatim.

- 4fd6165: feat: add opt-in orphan pruning (`--prune`)

  Pruning is off by default and never deletes translator work silently. Enable it with the new
  `translate --prune` flag or a `prune: true` option in the config (the flag takes precedence per run).
  When on, verbatra removes exactly the orphaned keys (present in a target file but absent from the
  source) from the written target file and the lock; no other key is ever touched. Combine
  `--prune --dry-run` to preview which keys would be removed without writing anything. The run summary
  (human and `--json` / watch NDJSON) reports a per-locale pruned count and key list alongside the
  existing orphaned reporting.

- 4fd937b: feat(sdk): split a locale's translation request into bounded sub-batches

  A locale's missing-plus-changed entries are now divided into sequential sub-batches no larger than a
  configured maximum, and each sub-batch is sent as its own provider request. A locale whose entry
  count is at or below the maximum still issues exactly one request, so the common case is unchanged.
  The accepted translations from every sub-batch are merged into one target file and written once, so
  the on-disk result for a multi-sub-batch locale is identical to what a single un-chunked request
  would have produced for the same accepted set.

  The maximum is a new optional config field, `maxBatchSize`: a positive integer validated at the
  config boundary (zero, a negative number, a non-integer, or a non-number is rejected with a
  structured config error). When the field is absent the documented default of 50 applies. The field
  is config-only for this slice; no CLI flag is added.

  A failed sub-batch no longer sinks the locale. If a sub-batch's provider call throws, or its results
  fail integrity, only that sub-batch's keys are withheld (not locked, so they are retried next run)
  while the remaining sub-batches are still merged, written, and locked. The locale's overall status
  stays `succeeded`, and a chunk-level provider failure surfaces as a concise, secret-free
  `SUB_BATCH_FAILED` notice on the locale summary rather than throwing. The raw provider error is never
  bound or surfaced. This is a behavior change for the provider-throw path: a thrown provider call
  previously failed the whole locale, and now isolates to the affected sub-batch's keys.

  Compatibility: projects whose locales fit within the default in a single request behave exactly as
  before. Lock-file format and semantics are unchanged.

### Patch Changes

- 2ba217b: fix(config): restrict the provider model field to the selected provider's known models

  `defineConfig` is now declared as one overload per provider id, each taking that
  provider's concrete authoring config. Overload resolution picks the variant from the
  `provider.id` literal, so `provider.options.model` is restricted to that provider's known
  model IDs: the editor offers only those models, and a foreign or unknown model (for
  example a Claude model under `id: "gemini"`) is a type error at authoring time. Concrete
  per-provider signatures avoid the generic/nested-discriminated-union inference that some
  editors (notably the JetBrains/WebStorm completion engine) do not perform and that
  otherwise makes them fall back to offering every provider's models. This is a type-only
  DX change: the runtime schema stays `z.string().min(1)` (a model the installed provider
  SDK does not yet list is flagged in the editor but still runs), `defineConfig` still
  returns `VerbatraConfig`, and DeepL (no model field) is unchanged.

- 4fd6165: fix: make atomic-write temp-file names collision-proof

  Both atomic-write paths (the SDK file seam and the format-adapters JSON writer) now append a random UUID to the temp-file name, so two writes to the same target in the same millisecond from the same process can never collide on the temp name. The atomic same-directory-temp-then-rename behavior is otherwise unchanged.

## 0.2.2

### Patch Changes

- 82c4555: Add provider model autocompletion to config authoring, sourced from the installed
  provider SDK types. Each LLM provider now exports a model type (`AnthropicModel`,
  `OpenAiModel`, `GeminiModel`) taken directly from that provider SDK's own published
  model type, so the single source of truth is the installed SDK and there is no
  hand-maintained list to drift. `defineConfig` surfaces those IDs as editor completions
  for `provider.options.model`, narrowed by the selected `provider.id`. This is a
  type-only DX change: the suggestions are an open union that still accepts any other
  string, the runtime schema stays `z.string().min(1)`, and there is no runtime behavior
  change.

## 0.2.1

### Patch Changes

- 3d38db5: Bring the published package READMEs up to the shipped 0.2.0 surface. The CLI README now lists all
  five commands (adds `export` and `import`) with their documentation links and a note on the manual
  -translation workflow. The SDK README documents all six exported functions (adds `exportWorkbook`
  and `importWorkbook` with signatures) and the optional `glossary` and `tone` config fields. The
  npm `homepage` now points at the documentation site. No runtime code changed.

## 0.2.0

### Minor Changes

- fc83588: Add the Excel manual-translation workflow: export untranslated strings to a styled `.xlsx`
  workbook and import the filled workbook back into the locale files.

  - New package `@verbatra/exchange`: a neutral, format-agnostic workbook row model with
    `buildWorkbook` and `readWorkbook`. The xlsx library (exceljs) is isolated here. The
    untrusted workbook parse is bounded (entry, decompressed-byte, sheet, row, and cell caps)
    and its XML is rejected if it declares a DTD or entity; structural problems surface as a
    structured, secret-free `WORKBOOK_INVALID` error.

    Threat model and design reasoning for the workbook parse guards:

    - The decompressed-byte cap is checked both against each entry's declared (header) size and
      against the bytes actually produced as the entry decompresses, so a zip whose header lies
      about the uncompressed size cannot bypass the cap (a decompression-bomb / "zip bomb"
      defense).
    - The DTD/entity rejection (`assertNoDoctype`) is a deliberately parser-independent,
      defense-in-depth guard against XXE and entity-expansion. exceljs parses XML with saxes,
      which by analysis does not resolve external entities by default; rather than depend on that
      default holding across library versions, the guard rejects any part that even declares a
      DTD or entity before exceljs ever parses it. It runs on every decompressed entry, not only
      `.xml`/`.rels`, because exceljs also parses markup parts such as `.vml`, so a DOCTYPE or
      ENTITY smuggled into one of those must be caught before parsing. A well-formed xlsx contains
      neither construct in any part.
    - These caps and the DTD/entity guard were added during the security review of the workbook
      interchange feature.

  - `@verbatra/sdk`: `exportWorkbook` and `importWorkbook`, composing the existing source read,
    adapter selection, lock baseline, diff, and the core placeholder/ICU/drift checks. Import
    returns a `RunSummary` structurally identical to `translate`'s; withheld rows (placeholder
    mismatch, invalid ICU, source drift) are reported and never written, and the lock is not
    updated for them.
  - `@verbatra/cli`: `verbatra export` and `verbatra import <workbook>`, thin wrappers over the
    SDK with `--include-unchanged` on export and `--dry-run` on import. The import exit-code rule
    matches `translate`.
  - `@verbatra/format-adapters`: one additive, non-breaking `FormatAdapter.validateMessage(value)`
    method to ICU-check a filled value before writing (next-intl delegates to its existing ICU
    logic; the other adapters report every value valid).

## 0.1.0

### Minor Changes

- c5d8cd6: Add an optional `configPath` to `loadConfig`'s options for loading one explicit config file instead
  of searching. When given, the loader resolves the path (relative against `cwd`, absolute as-is) and
  loads it through cosmiconfig's `load()`, which reuses the same loaders search uses (.json/.yaml/.ts via
  the TypeScript loader), then validates it through the same zod boundary. A genuinely missing file is
  `CONFIG_NOT_FOUND`; a present-but-unparseable or invalid file is `CONFIG_INVALID` - both existing
  codes, no new error code. Precedence is `configOverride` > `configPath` > search. Purely additive: when
  `configPath` is absent, `loadConfig` behaves exactly as before (the existing config-loading tests are
  unchanged). This unblocks the CLI's `--config <path>` flag as a thin pass-through.
- 8861ed8: Add @verbatra/sdk, the central orchestration API and the first SDK slice: the one-shot
  end-to-end translate flow that composes core, format-adapters, and ai-providers
  (config -> read -> diff -> translate -> write) with verbatra.lock.json as the
  change-detection baseline.

  The SDK adds no format, provider, or hashing logic of its own: it loads and zod-validates
  the config (cosmiconfig + cosmiconfig-typescript-loader, supporting a code-defined
  verbatra.config.ts via defineConfig and file-based configs, first-found-wins),
  selects an adapter by explicit format, constructs the configured provider (key read from
  env by the provider, never by the SDK), injects the selected adapter's own placeholder
  extractor into every translate request, routes the glossary term-map to the provider and
  surfaces provider notices, and reuses core's diffResources and contentHash.

  Per target locale it reads source + target, diffs against the lock-file baseline,
  translates only missing/changed keys (skipping invalid-ICU source), enforces per-key
  integrity (a failed key is withheld from the file and not lock-updated, so it retries),
  writes back preserving structure/order, and updates the lock-file. Locales are isolated:
  one locale's failure does not roll back others and the run continues. Dry-run reads + diffs

  - reports without constructing or calling the provider and without writing any file or the
    lock-file. Watch mode is intentionally deferred to a later slice.

- 1390e2d: Add watch mode: a long-running wrapper over the one-shot translate flow. It watches the configured
  source file, debounces filesystem events (300 ms default, configurable), and re-runs the existing
  one-shot `translate()` on each settled change. Runs are serialized and coalesced through an
  IDLE/RUNNING state machine with a single boolean pending-rerun flag: a change during a run never
  starts a concurrent run, and any number of mid-run changes collapse into exactly one immediate
  follow-up (no fresh debounce). Watch adds no translation, diff, or lock logic of its own - each run
  is the slice-1 flow unchanged, so the lock-file and per-locale atomic writes are reused as-is. An
  initial run happens on startup; a missing source path at startup is a hard `SOURCE_UNREADABLE`
  error, while a run that fails after start is reported and watching continues. Run summaries and
  failures are surfaced through a caller-supplied `onRun` callback (the SDK does no logging and puts
  no secret on the output path); the failed result carries only a secret-free `{code, message}`. The
  returned controller exposes `stop()`, which stops accepting triggers, discards any pending
  follow-up, closes the watcher, and awaits the in-flight run to completion (signal wiring such as
  SIGINT lives in the cli wrapper, not the SDK). New dependency: `chokidar` (pinned exact).
