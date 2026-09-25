---
"@verbatra/cli": patch
---

Say why `verbatra import` withheld a row whose source changed since the export.

Previously such a row was listed under `integrity-withheld` with its key alone, unlike the rows the
integrity gate refused, which name their reason.

Now its line reads `key: source changed since export`. The `--json` output is unchanged.
