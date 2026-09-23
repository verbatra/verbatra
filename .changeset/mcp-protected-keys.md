---
"@verbatra/mcp": patch
---

Describe protected and pinned keys in the tools that read or write translations.

Previously the tool descriptions said nothing about keys verbatra leaves for a person. They now say
that `translation.retranslateEntry` refuses a value a person wrote, imported, or changed outside
verbatra (`KEY_PROTECTED`) and a pinned key (`KEY_PINNED`), that `translation.editEntry` refuses a
pinned key, that `translation.translatePending` lists protected keys instead of translating them,
and what the `protected` fields of `status.check` and `status.diff` mean.
