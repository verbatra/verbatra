---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `check --qa` to run the integrity and review checks on committed translations.

Previously the placeholder, markup, ICU and plural-arm checks and the review flags ran only on
values verbatra was about to write, so a translation typed by hand, merged from another tool, or
edited in the JSON never got them. `verbatra check --qa` now runs the same checks over every
committed target value, keyless and without writing anything, and reports each gate refusal as an
error and each review reason as a warning, per locale and key. It exits `1` on an error, and on a
warning too with `--strict`; `--severity error` reports errors only. The SDK's `check` takes
`qa` and `qaSeverity` and returns the report on each locale and the totals on the summary.
