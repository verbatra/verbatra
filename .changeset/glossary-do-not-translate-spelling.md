---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Keep the stored spelling of a do-not-translate entry that is written again in another case.

- **Glossary writes:** `updateGlossaryTerm`, `editConfiguredGlossaryTerm`, the MCP `glossary.write` tool and Studio's glossary editor keep the spelling already stored when a do-not-translate entry that does not match case is written again in another case, as they already do for a regular term.
- **Upgrade:** in 0.13.5 such a write replaced the stored spelling with the new one (`Acme`, then `ACME`, left `ACME`). It now leaves `Acme`. To change the spelling, remove the entry and add it again.
