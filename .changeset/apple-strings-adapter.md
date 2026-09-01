---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `apple-strings`, a new supported format, for Apple's `.strings` localization
files (flat `"key" = "value";` pairs) and their sibling `.stringsdict` plural
files, both addressed through the same format id. Printf-style placeholders
(`%@`, `%d`, `%1$@`) are guarded across translation, and CLDR plural categories
round-trip as separate entries with no fabricated or dropped categories. A
UTF-16 `.strings` file is rejected with a clear error instead of being parsed
into corrupt data. Writes preserve existing key order, comments, and
non-translatable `.stringsdict` structure, creating missing `.lproj` directories
as needed.
