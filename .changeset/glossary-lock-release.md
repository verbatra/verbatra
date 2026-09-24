---
"@verbatra/sdk": patch
---

Report a glossary write lock that cannot be released as `GLOSSARY_UNWRITABLE`.

Previously, when `updateGlossaryTerm` saved an edit but could not delete its write lock, the raw
file-system error escaped instead of an `SdkError`.

Now it is `GLOSSARY_UNWRITABLE` with the file-system error as its `cause`, and the message says the
edit was saved and that the lock stays until a later run reclaims it after this process exits. When
the edit itself failed, its own error is still the one reported.
