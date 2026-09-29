---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Stop warning about the source locale on a LibreTranslate server, and word the remaining warning accurately.

Previously every run against a LibreTranslate server attached a `LOCALE_UNVERIFIED_BY_PROVIDER`
notice for the source locale to every target locale, and the warning suggested that running
`verbatra doctor --locales --live` would settle it. The source locale is now judged `unverified`
without a warning, and a target locale's warning says that a self-hosted server's languages cannot
be verified before a run and that a live check's result is not kept, so the notice appears on every
run.
