# Deciding what to run

The single most useful habit: **ask what is pending before you translate.** A run
bills per key sent, so the cheap read-only question comes first.

- `verbatra diff --json` names the exact keys per locale. Exit `1` means there is
  work. This is the question built for the decision. Add `--unused` to also list
  source-locale keys no source reference names, scanned from the config's
  `extract` roots; unused keys only raise the exit code when the scan was
  complete, and they are a report, never something to delete without asking.
- `verbatra check --json` answers the same thing in counts when a yes or no is
  enough. Add `--consistency` to also list source strings a locale translates
  more than one way under different keys; that report never changes the exit
  code. Add `--qa` to also run the write-time integrity gate and the review checks
  over every committed translation: the totals land in `result.qa` (`errors`,
  `warnings`, `invalidSourceKeys`) and each locale's findings in
  `result.locales[].qa`. An integrity error exits `1`; a review warning exits `1`
  only under `--strict`, and `--severity error` drops the warnings from the report.
  Review warnings carry a reason code and, where one part is at fault, `details`:
  `FOREIGN_PLACEHOLDER_CHANGED` means a translation dropped or changed a token
  shaped like a placeholder the format does not protect (such as `{name}` in an
  i18next value, named in `details` as `-{name}`), and `BIDI_CONTROLS_CHANGED`
  that it holds unclosed or added direction controls that can reorder the text.
  Fix the translation; never edit the source to silence either.
  Every `check` also lists, in `result.locales[].incompletePlurals`, each plural
  that lacks a CLDR category its target language uses (code
  `PLURAL_CATEGORIES_INCOMPLETE`, with `key`, `argument` for an ICU message,
  `ruleType` and `missing`), such as a Polish Android `<plurals>` with only `one`
  and `other`. That is a warning: it never changes `inSync` or the exit code, except
  that `--qa --strict` exits `1` on it. Add the missing forms by hand; do not
  delete the plural.
  `--severity` or `--strict` without `--qa` or `--file`, and `--strict` with
  `--severity error`, fail with `INVALID_QA_OPTION`; a severity other than `error` or `warning` fails
  with `INVALID_SEVERITY`.
  Add `--require-reviewed` to gate on review decisions: it exits `1` while any
  value whose origin is `machine`, `memory`, `fuzzy` or `agent` is not approved in
  the committed `verbatra.provenance.json`. `result.review` carries `reviewed`,
  the `unreviewed` count and a stable `code`, `REVIEW_REQUIRED` or
  `REVIEW_STATE_UNREADABLE` (the provenance file is corrupt or from a newer
  verbatra, which fails the gate), and each locale lists its keys in
  `result.locales[].review.unreviewed`. It is keyless. Approving is a person's
  decision, made in Studio or relayed through an MCP client; never approve values
  to make the gate pass.
  Add `--sensitive` to scan every source key (name, value, description, meaning)
  and the glossary for content that looks sensitive, with the detectors, patterns
  and allow list of the config's `sensitiveData` block, or the default detectors
  without one. It exits `1` on any finding and is keyless. `result.sensitive` is
  `{ findings, glossaryTerms }`, each finding `{ key, fields, detectors }`; it
  names detectors, never the matched text except where it is part of a key name.
  Report the keys; removing the content, allowing it or turning a detector off is
  the human's call.
- `verbatra check --file <path> --json` checks only the locale file you just
  edited, reading no other locale: run it after every hand edit of a locale file.
  `result` has the per-locale shape of `--qa` (`role` is `source`, `target` or
  `catalogue`, `locales[].qa.findings`, totals in `result.qa`), and a file that no
  longer parses is one finding with `reason` `syntax`, the adapter's `code`
  (`INVALID_JSON`, `INVALID_YAML`, ...) and, for JSON and YAML, `line` and
  `column`. The source locale file is checked for syntax only. An error finding
  exits `1`, warnings only under `--strict`. A path that is no configured
  locale's file exits `2` with `NOT_A_LOCALE_FILE`; `--locales`,
  `--consistency`, `--require-reviewed` or `--sensitive` next to `--file` exit
  `2` with `INVALID_OPTION`.
- `verbatra translate --dry-run --json` produces the full run summary a real run
  would produce. A dry run constructs no provider object at all, so it reads no
  key, opens no connection, and writes nothing. It is safe on a machine that has
  never had a key.
- `verbatra translate --estimate` sizes and prices the run, then exits. It implies
  `--dry-run`, so it also constructs no provider. Show its figure before asking
  for a yes. When the human agrees to a ceiling rather than an open-ended run,
  `verbatra translate --max-tokens <n>` holds that run under `n` tokens: the lower
  of the flag and the config's `maxTokens` applies, a request that would cross it
  is withheld rather than sent, and its keys are listed under `budgetWithheld`. A
  token budget and `--concurrency` above `1` cannot be combined.

Before the first run against DeepL or Google Cloud Translation, or after adding
a target locale, `verbatra doctor --locales` shows what the provider supports for
every target locale: the code it is sent as, `supported`, `unverified` or
`unsupported`, and whether a glossary and a formality setting can be applied.
It is judged against a dated table verbatra ships, calls no provider and needs no
key; `--live` checks a machine-translation provider against its current list
instead (DeepL and Google only when their key is set), and sends nothing for an LLM
provider or `none`. `translate` refuses an `unsupported` locale up front with
`LOCALE_UNSUPPORTED_BY_PROVIDER` (exit `2`, nothing started, nothing spent), so
drop it with `--locales` or ask the human; never map it in `localeMap` on your own
to get past the refusal.

## Review reasons worth knowing

A review reason is a per-key signal that a person should look at a value. It is never
a model self-score; verbatra computes it from the source and the translation. Two are
easy to misread:

- `LENGTH_RATIO_OUTLIER`: the translation is far shorter or longer than the source.
  Length is counted in graphemes weighted by script so it is Latin-equivalent: a Han
  character counts 3.5, a Hiragana or Katakana character 1.5, a Hangul syllable 2 and
  anything else 1. A correct CJK translation is therefore not flagged for its script
  alone, and a CJK source into a Latin target can flag where 0.11 did not. It is
  relative to the source; `MAX_LENGTH_EXCEEDED` is the absolute per-key budget.
- `GLOSSARY_FORBIDDEN_TERM`: the translation uses a rendering the glossary forbids
  for that target locale. It is matched as a whole word, or by containment for scripts
  written without word separators, so an inflected or compounded form is caught only
  when it is listed too, and a rendering the source itself contains is not flagged.
  Fix the translation, or ask the human whether the glossary is wrong.
