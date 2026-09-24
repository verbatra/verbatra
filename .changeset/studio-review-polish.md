---
"@verbatra/studio": patch
---

Polish the Review and Translations pages.

After Reject and remove, whether opened from the row button or with `r`, focus now lands on the
row that moves up into the rejected entry's place once the queue has reloaded, instead of being
lost with the removed row. A dialog no longer tries to return focus to an element that left the
page while it was open.

A running retranslation now shows how long it has run on its **Retranslate** button, and the
screen reader announcement changes only when it starts and then every 15 seconds instead of every
second.

In the editor, the glossary's "Never" line is plain muted text; red is kept for the live
**Forbidden** badge when the draft actually uses a forbidden rendering.

In the Translations list, each locale's summary is a compact label and count list that follows the
search and the state filter instead of always showing the unfiltered totals.
