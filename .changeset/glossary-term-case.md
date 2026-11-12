---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Editing a glossary term no longer adds a second term that differs only in case.

- **Glossary writes:** `updateGlossaryTerm`, `editConfiguredGlossaryTerm`, the MCP `glossary.write` tool and Studio's glossary editor now update the stored term when the edited one differs only in case and neither matches case, keeping the stored spelling. Writing `Cart` used to add a second term beside `cart`, and both then matched the same text with different translations.
- **Unchanged:** a term stored with `caseSensitive: true`, or an edit that sets it, still gets its own entry, and a glossary that already holds both spellings loads as before.
