---
"@verbatra/studio": minor
---

Polish the Review and Translations workflow after a design review.

The **Integrity problems** filter now judges every translated key, not only changed ones, through
the new sdk `localeIntegrity`, so a broken placeholder, markup, or plural arm in a key that is in
sync is found; `verbatra_locale_integrity` lists only failing keys. The editor checks your draft
against the glossary as you type (term used, missing, or forbidden rendering used), shows why a
Review entry was flagged, highlights a draft over the key's `maxLength`, and focuses the text area
when opened with `e` or Enter. `verbatra_key_context` takes an optional `draft` and reports
`maxLength`. A busy row shows its state on the button that started it, a running retranslation
survives a page reload with its elapsed time through the new human-only `translation.inFlight`
method, and an already running retranslation is reported as progress instead of an error. After a
decision, an editor save, or **Clear selection**, focus returns to the queue; **Clear filters**
returns it to the search field. A bulk action keeps only its failed entries selected and lists
failures grouped by cause. The **Needs review** chip is now **Protected**, the List search updates
the chip counts and shows an empty state, the Grid shows **Absent** for a key the source no longer
has, translated values render in the sans font with their `lang`, and the Review table stacks
reasons and actions under the key on narrow screens.
