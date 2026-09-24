---
"@verbatra/studio": patch
---

Render right-to-left translations without mirroring the dashboard around them.

Before, `dir="rtl"` sat on whole grid cells, headers, list sections and drawer blocks, so English
labels, counts and the Edit button flipped, placeholders such as `#{orderId}` and inline markup
reordered inside the value, and a long integrity detail ran off the drawer on one line.

Now only the element holding a translated value takes the locale's direction, placeholders, ICU
syntax and markup inside it are isolated left to right, the edit dialog's text area follows the
locale, and the integrity pill shows its label with the detail wrapping below it.
