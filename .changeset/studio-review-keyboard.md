---
"@verbatra/studio": minor
---

Work the Review queue from the keyboard, and retranslate a flagged entry from its row.

Previously every review action needed the mouse, and a flagged entry could only be retranslated
from the key detail view on Translations, and only when its integrity indicator showed a defect.
Now `j` and `k` (or the arrow keys) move a highlighted row through the queue, `a` approves it, `r`
opens the reject confirmation, `e` or Enter opens the editor, and `t` retranslates it when Studio
runs with `--allow-spend`. `?` or the new **Keyboard shortcuts** button lists the shortcuts. They
pause while a field has focus, a dialog is open, or a modifier key is held; the highlighted row
takes keyboard focus and each action button names its shortcut in `aria-keyshortcuts`. With
`--allow-spend`, each row also carries a **Retranslate** button that calls the existing
`translation.retranslateEntry` method and reports the outcome above the table.
