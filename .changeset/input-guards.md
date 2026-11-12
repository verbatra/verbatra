---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Refuse two inputs that used to corrupt project files.

- **Actor:** `applyValueReplace` and `editEntry` now refuse an `actor` that is not `human` or `agent` (a plain JavaScript caller that left it out) with a `TypeError` before writing anything. Such a call used to write a provenance record with no origin, after which approving, translating and other flows failed with `PROVENANCE_FILE_INVALID`. The provenance writer also refuses to write a record its own reader would reject.
- **Glossary:** `updateGlossaryTerm` and `editConfiguredGlossaryTerm` now refuse a missing `term` with the same `CONFIG_INVALID` error as a blank one, instead of storing a term named "undefined" in a version 1 glossary.
- **Upgrade:** a project that already holds a provenance record with no origin, or a glossary term named "undefined", must be repaired by hand; the fix only stops new ones.
