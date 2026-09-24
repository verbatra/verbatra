---
"@verbatra/cli": patch
---

List every refused TMX unit in `verbatra tmx import` output.

Previously a refused unit whose check named no single part at fault was counted but not listed.

Now each refused unit prints as `unit N: reason`, followed by its details when the check names
them. `verbatra import` and `verbatra tmx import` share one details formatter.
