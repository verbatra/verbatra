---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Editing a glossary term no longer adds a second term that differs only in case.

- **Glossary writes:** `updateGlossaryTerm`, `editConfiguredGlossaryTerm`, the MCP `glossary.write` tool and Studio's glossary editor now update the stored term when the edited one differs only in case and neither matches case, keeping the stored spelling. Writing `Cart` used to add a second term beside `cart`, and both then matched the same text with different translations.
- **Unchanged:** a term stored with `caseSensitive: true`, or an edit that sets it, still gets its own entry, and a glossary that already holds both spellings loads as before.
- **Case folding:** the fold follows the project's source locale, as the matcher does, so with a Turkish source locale `İstanbul` and `istanbul` are one term and `Ilık` and `ilık` are not. `updateGlossaryTerm` takes an optional `sourceLocale` for this and matches only exactly without it; `editConfiguredGlossaryTerm` and the MCP and Studio writes pass the config's source locale.
- **Version 1 glossaries:** deleting `Cart` also removes a stored `cart`, since both are the same term.
- **Do-not-translate:** editing or removing an entry that does not match case updates the stored entry by any spelling instead of adding a case duplicate.
