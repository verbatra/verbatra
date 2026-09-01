---
"@verbatra/sdk": patch
---

Fix a polynomial-time regular expression denial-of-service in the printf-style and gettext placeholder extraction used by the Android `strings.xml`, Apple `.strings`/`.stringsdict`, and gettext `.po`/`.pot` adapters. The flags and field-width parts of the specifier pattern both matched a leading `0`, so a translatable string starting with `%` followed by many `0` characters made the regex engine try every possible split between the two before failing, taking quadratic time. The field-width alternative now requires a leading nonzero digit, which any legitimate width already has once the flag characters (including `0` padding) are accounted for, so previously matched placeholders are extracted identically while the ambiguous split is eliminated.
