---
"@verbatra/sdk": minor
---

Preview an ICU message for a locale with `previewIcuMessage`.

- **What it returns:** one row per arm of a `next-intl-json` or `arb` message, with the rendered text. Other formats answer `supported: false`.
- **Safe on any text:** an invalid, too long or too complex message comes back as `valid: false` with a reason instead of throwing.
