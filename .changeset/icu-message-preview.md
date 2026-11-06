---
"@verbatra/sdk": minor
---

Preview an ICU message for a locale with `previewIcuMessage`.

- **What it returns:** one row per plural category, exact arm or select option of a `next-intl-json` or `arb` message, varying one argument at a time, with the rendered text as plain `text`, `argument` and `tag` segments. A row for a nested argument holds the enclosing argument at the arm that contains it. Other formats answer `supported: false`.
- **Safe on any text:** a message that is too long, nests too deeply, has more than 256 `{` and `<` characters, is not valid ICU, or names an unknown locale comes back as `valid: false` with a reason instead of throwing.
- **Runtime data:** numbers and dates are formatted with this Node's CLDR data, dates at a fixed instant in UTC, so the text can differ from your application's own runtime.
