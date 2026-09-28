---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `verbatra check --require-reviewed`, a keyless CI gate on review decisions.

It exits `1` while any machine-written translation (origin `machine`, `memory`, `fuzzy`, or
`agent`) is not approved in the committed `verbatra.provenance.json`, lists the unreviewed keys per
locale, and takes `--locales` like the rest of `check`. Under `--json`, `result.review` carries
`reviewed`, the `unreviewed` count, and a stable `code`: `REVIEW_REQUIRED`, or
`REVIEW_STATE_UNREADABLE` when the provenance file is corrupt or from a newer verbatra, which fails
the gate rather than passing it. Each locale carries `review.unreviewed`. In the SDK, `check` takes
the new `requireReviewed` input and returns `CheckSummary.review` and `LocaleCheckSummary.review`.
