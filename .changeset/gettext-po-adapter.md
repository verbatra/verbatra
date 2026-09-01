---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `gettext-po`, a new supported format, for GNU gettext `.po` and `.pot`
catalogs. `msgid`/`msgstr` pairs become entries, `msgctxt` disambiguates entries
sharing a `msgid`, and plural forms round-trip as separate entries keyed by
their `msgstr[n]` index. Comments, references, flags, and the header block are
preserved on write. Printf-style (`%s`, `%d`, `%1$s`) and Python-style
(`%(name)s`) placeholders are guarded across translation. Known limitation: a
plural form present only in a target locale cannot always be distinguished from
a removed key, which only matters when `--prune` is enabled.
