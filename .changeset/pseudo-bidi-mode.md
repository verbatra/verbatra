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
  without further setup. It follows Arabic plural rules while the file keeps the source's plural
  forms; pass `--locale en-XB` to keep English plural rules.

**SDK and output**
- `pseudolocalize` takes `mode` (`PSEUDO_MODES`: `accented`, the default, or `bidi`), and its
  result, the `--json` envelope and the terminal summary name the mode.
- An unknown `--mode` value exits 2 with `INVALID_OPTION`.
