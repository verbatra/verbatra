---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

`verbatra pseudo --mode bidi` writes a right-to-left pseudolocale, `ar-XB` by default.

**Bidi pseudolocale**
- Every word of translatable text is wrapped in a right-to-left mark and override, so the app
  renders it right to left while the file keeps the letters in their stored order.
- Placeholders, ICU syntax, markup, digits and punctuation stay outside the override, and every
  value still passes the integrity gate. Nothing is accented or padded in this mode.
- `ar-XB` resolves to right-to-left direction, so an app that derives `dir` from the locale flips
  without further setup. For `i18next-json`, the file also gets every Arabic plural category the
  source lacks (`_zero`, `_two`, `_few`, `_many`), filled from the source's `other` form, so no
  count falls back to another language. Pass `--locale en-XB` to keep English plural rules.

**SDK and output**
- `pseudolocalize` takes `mode` (`PSEUDO_MODES`: `accented`, the default, or `bidi`), and its
  result and the `--json` envelope carry `mode`.
- The terminal summary names the mode: `en-XA (accented): 118 of 120 entries pseudolocalized`
  instead of `en-XA: 118 of 120 entries pseudolocalized`.
- `transformed` counts only values written differently from the source, so a value that is only a
  placeholder no longer counts in bidi mode.
- An unknown `--mode` value exits 2 with `INVALID_OPTION`.
