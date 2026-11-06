---
"@verbatra/sdk": minor
---

Preview an ICU message for a locale with `previewIcuMessage`.

- **What it returns:** one row per arm of a `next-intl-json` or `arb` message (each plural category, exact arm and select option, and each place one appears), varying one argument at a time, with the rendered text as plain `text`, `argument` and `tag` segments. A row for a nested argument holds the enclosing argument at the arm that contains it and lists it in `held`. A value in `args` for a plural, ordinal or select argument adds one extra row showing it. Other formats answer `supported: false`.
- **Safe on any text:** a message that is too long, nests too deeply, has more than 256 `{` and `<` characters, is not valid ICU, or names an unknown locale comes back as `valid: false` with a reason instead of throwing.
- **Runtime data:** numbers and dates are formatted with this Node's CLDR data, dates at a fixed instant in UTC unless a number in `args` sets the instant, so the text can differ from your application's own runtime.
