# CLI commands reference

## Commands

Read this table before running anything unattended.

| Command | Provider spend | Writes files | Needs a key |
| --- | --- | --- | --- |
| `translate` | yes, unless `--dry-run`, `--estimate` or provider `none` | yes | yes, for a real run with a provider |
| `watch` | yes, once per source change, unless provider `none` | yes | yes, unless provider `none` |
| `export` | no | yes, the translator handoff: a workbook, CSV, TSV or XLIFF | no |
| `import` | no | yes, target locales, the lock file and `verbatra.provenance.json` | no |
| `tmx` | no | yes on import, the translation memory; yes on export, the TMX file | no |
| `check` | no | no | no |
| `diff` | no | no | no |
| `report` | no | no | no |
| `pseudo` | no | yes, a pseudolocale under the out directory | no |
| `types` | no | yes, the generated declaration, unless `--check` | no |
| `doctor` | no | no | no, its checks only test that the key variable is set and never read its value; `--literals` does not even check for one; `--live` fetches a machine-translation provider's language list, sending the key DeepL and Google use when it is set (optional, and it uses no translation quota); `--data-flow` reads no key, makes no network request and spends nothing |
| `studio` | only with `--allow-spend` or `VERBATRA_STUDIO_ALLOW_SPEND` | yes, through in-place edits | only when spend is granted |
| `mcp` | only with `--allow-spend` or `VERBATRA_MCP_ALLOW_SPEND` (also read from `.env.local` and `.env`) | yes, through in-place edits | only when spend is granted |
| `init` | no | yes, the config, the env example unless the provider is `none`, and `.gitignore`; with `--agent` also `AGENTS.md` or `CLAUDE.md` and each wired client's MCP config (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.codex/config.toml`, `.gemini/settings.json`); nothing with `--dry-run` | no |
| `extract` | no | yes, the source locale, unless `--dry-run` | no |

`import` is worth calling out: it applies human translations from a workbook and
holds them to the same integrity gate as provider output, at no provider cost.
When a human has already done the work, `export` then `import` is the free path.

For a translation agency working in a CAT tool (Trados, memoQ, OmegaT, Phrase),
`verbatra export --format xliff2` (or `xliff12` for an older tool) writes one
`<locale>.xlf` per locale into the `--out` directory, with placeholders protected
as inline codes. `verbatra import` reads it back through the same gate; a path
ending in `.xlf` or `.xliff` needs no `--format`. A unit the agency marked
`reviewed` or `final` is recorded as approved and reported with the notice
`HANDOFF_REVIEWS_RECORDED`. `--reviewer <name>` names who approved it; that is a
person's decision, so pass only the name the human gave you.

A human-readable `import` or `translate` summary counts each locale's outcome
(`1 notice` / `2 notices`, `malformed-row(s)`, `duplicate-key(s)`,
`integrity-withheld`, `sensitive-withheld`, and so on) and lists every key the integrity gate withheld
under `integrity-withheld:` as `key: reason (details)`, the reason being
`placeholder`, `markup`, `icu`, `degenerate` or `empty`. The same refusals are in
`--json` as `result.locales[].integrityRefusals` (`key`, `reason`, `details`).
Parse the JSON, never these lines.

`tmx` is the other free path. `verbatra tmx import <file>` lands a translation
memory another tool produced into this project's memory, so a later run reuses
it instead of paying for those strings again, and `verbatra tmx export` writes
this project's memory out in the same standard format. Everything in an imported
file faces the same integrity gate provider output does, and a translation the
project already holds wins a disagreement unless `--overwrite` is passed. Neither
direction calls a provider or reads a key. An import reports per locale how many
units were `added`, `unchanged`, `kept`, `overwritten` and repeated, counts what
the gate `rejected` by reason, and lists each refused unit as
`unit N: reason (details)` (in `--json`, `result.locales[].refusals` with `unit`,
`reason` and `details`), `N` being the unit's position in the file.

`verbatra report provenance --json` lists, per target locale, every key's origin
(`machine`, `memory`, `fuzzy` and `agent` are machine-written; `human`, `import`,
`external`, `unrecorded`, `unknown`), its review state, and a `bucket`
(`machine-unreviewed`, `machine-reviewed`, `human`, `import`, `external`,
`unrecorded`, `unknown`) with per-bucket `counts`, stamped with `generatedAt`,
`toolVersion` and `sourceLocale`. It is read-only and keyless; its only argument
is the report name, and `provenance` is the only one. Exit `1` with
`result.available: false` means `verbatra.provenance.json` is corrupt or from a
newer verbatra, not an empty report. The report is supporting evidence of which
text was machine-generated, never legal advice: do not tell the human that a
project is compliant with anything because of it. XLIFF and TMX exports carry
the same marking (`state-qualifier="mt-suggestion"` in XLIFF 1.2, `origin` and
`review-state` metadata in XLIFF 2.0, `x-origin` and `x-review` properties in
TMX), and imports ignore it; `result.provenanceMarkers: "unavailable"` on an
export means no marker could be written.

`verbatra pseudo` writes a pseudolocale built from the source strings, with no
provider, no key and no network request. The default `--mode accented` writes
`en-XA`; `--mode bidi` writes `ar-XB`, a right-to-left pseudolocale, so layout
that assumes left-to-right text shows up before a real translation exists, and an
`i18next-json` plural also gets every CLDR category Arabic needs and the source
lacks, filled from its `other` form. An unknown `--mode` exits `2` with
`INVALID_OPTION`.

Three commands read application source through the config's `extract` block, and
none of them calls a provider: `extract` adds keys found at translation call
sites to the source locale, `diff --unused` lists source keys nothing references,
and `doctor --literals` lists hardcoded user-facing strings that never went
through a translation call. Only `extract` writes, and only the source locale.

Never read a missing `--allow-spend` as proof that a session cannot spend. Both
servers take the capability from an environment variable as readily as from the
flag, so an inherited shell or a CI job can grant it with nothing on the command
line. Ask the tool surface what it was granted rather than inferring it from the
command you can see.

`verbatra mcp --redact-values` (or `VERBATRA_MCP_REDACT_VALUES`) starts the MCP
server with every translation value in its tool results replaced by a marker
carrying the value's length and a per-session hash; `verbatra-mcp-tools` covers
what that changes for a client. With an installed `@verbatra/mcp` too old to
confirm it redacts, the command exits `2` with `REDACTION_UNSUPPORTED` before
serving anything: upgrade `@verbatra/mcp`, never drop the flag the operator chose.

`watch` is the one command that asks for standing consent rather than one-off
consent. A confirmation to translate once authorises one run; starting a watcher
authorises an unbounded series of them, one per source-file save, for as long as
the process lives, with no further prompt. Say that in those words before you
start one, and prefer a single `translate` when the human only wanted the keys
that are pending right now translated.

## Flags that are easy to miss

- `translate --no-cache` and `watch --no-cache` bypass the local translation-memory
  cache (`verbatra.cache.json`) for the run, so keys the memory could have filled go to
  the provider and are billed again. It costs money: pass it only when the human asks
  for a fresh translation.
- `watch --debounce <ms>` waits that many milliseconds after a change before
  translating (default `300`, a whole number from `1` to `60000`; anything else exits `2`
  with `INVALID_DEBOUNCE`).
- `export --include-unchanged` also writes already up-to-date strings into the
  handoff; without it only what is missing or stale is exported.
- `studio --port <n>` overrides the default Studio port (1 to 65535; anything else
  exits `2` with `INVALID_PORT`).
- `pseudo --locale <code>` names the pseudolocale to generate: `en-XA` by default,
  `ar-XB` with `--mode bidi`.

`import` writes keys the target did not have yet in source order. A run creates no
target file for a locale whose keys were all withheld, so nothing empty is left behind.
