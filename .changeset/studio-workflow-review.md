---
"@verbatra/studio": minor
---

Polish the Review and Translations workflow after a design review.

A busy row shows its state on the button that started it, a running retranslation shows how long
it has run on its **Retranslate** button and survives a page reload through the new human-only
`translation.inFlight` method, and an already running retranslation is reported as progress
instead of an error. The screen reader announcement of a running retranslation changes only when
it starts and then every 15 seconds. The editor focuses its text area when opened with `e` or
Enter. After a decision, an editor save, or **Clear selection**, focus returns to the queue;
**Clear filters** returns it to the search field. The Grid shows **Absent** for a key the source
no longer has, translated values render in the sans font with their `lang`, and the Review table
stacks reasons and actions under the key on narrow screens.
