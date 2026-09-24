---
"@verbatra/studio": patch
---

Show right-to-left translations in reading order without mirroring the dashboard around them.

Before, Studio treated only `ar`, `he`, `fa` and `ur` as right to left, so Pashto, Sindhi,
Uyghur, Yiddish, Dhivehi, Sorani Kurdish, Syriac and others were shown left to right. Where it
did apply, `dir="rtl"` sat on whole grid cells, headers, list sections and drawer blocks, so
English labels, counts and the Edit button flipped, placeholders such as `#{orderId}`, ICU syntax
and inline markup reordered inside the value, and a long integrity detail ran off the drawer on
one line.

Now Studio asks the browser for the locale's text direction and, where the browser cannot say, uses
the locale's likely script, so `ku-Arab` is right to left while `ku` stays left to right and a tag
that cannot be parsed is left to right. Only the element holding a translated value takes that
direction. Placeholders, markup and ICU syntax inside it are isolated left to right and kept on one
line, while the text of each plural or select branch follows the value's direction; a value whose
syntax is wider than its container scrolls sideways instead of overflowing, with the dashboard's
focus ring when a keyboard focuses it to scroll. Printf placeholders are recognised with the same
length modifiers and conversions the pseudo-locale transform protects, such as `%hhd`, `%zu` and
`%1$s`. The edit dialog's text area follows the locale and shows a live read-only preview for
right-to-left locales, and the integrity pill shows its label with the detail wrapping below.
