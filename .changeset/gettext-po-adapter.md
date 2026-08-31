---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `gettext-po`, a twelfth supported format, for GNU gettext's `.po` and `.pot`
catalogs, detected by either extension. Built on `createFlatFileAdapter`, following
the properties and Apple `.strings` adapters' precedent: the destination is re-read
on write so comments, references, flags, `msgctxt`, and the header block survive
untouched, and a destination that does not exist yet is synthesized from the entries
alone.

A `msgid`/`msgstr` pair is one entry. `msgctxt`, when present, composes with `msgid`
into one key so two entries sharing a `msgid` under different contexts never
collide; the composite uses a reserved private-use codepoint as the internal
separator (never a literal character a `.po` file can contain) and is rejected with
a structured error if a source string ever contains it.

Plural forms follow the same bracketed key-encoding convention Android's
`android-xml` adapter uses (`key[selector]`, one entry per form), per the shared ADR
covering both formats. gettext's selector is the raw `msgstr[n]` decimal index, not
a CLDR category: index-to-category translation would require evaluating the file's
own `Plural-Forms` C expression, which verbatra does not do. That expression is
preserved verbatim as untouched header text; verbatra only parses the `nplurals=N`
integer out of it, to bound-check `msgstr[n]` indices on read. A file with plural
entries and no `Plural-Forms` header is rejected, matching `msgfmt --check`. The
`msgid_plural` text itself is not a first-class IR field (per the ADR,
`TranslationEntry` does not change); it round-trips through the destination
re-read like any other non-translatable structure, and is carried on `meaning` so a
brand-new plural group can still be synthesized when no destination exists yet.

A `#, fuzzy` entry's existing `msgstr` is read as the entry's current value, not as
missing; the flag itself is preserved verbatim on write and never added or cleared.
`#.` developer comments become entry `description`; `#:` references, other `#,`
flags, and `#|` previous-string comments are preserved but not otherwise
interpreted. A `#~` obsolete block is preserved as inert text and never becomes a
translatable entry. `.pot` templates (empty `msgstr`) read without error.

The parser is hand-rolled rather than a dependency: bounded by the shared
`INPUT_TOO_LARGE` read cap, and a malformed file raises a structured `AdapterError`
naming the msgid and the offending line rather than a generic parse failure.

Known limitation, shared with `android-xml` under the same ADR: verbatra's orphan
and `--prune` detection has no plural-encoding awareness, so a plural form that
exists only in a target locale (for example a language needing more forms than the
source declares) is indistinguishable from a genuinely removed key and can be
pruned. Off by default; only affects a `--prune` run.

Printf placeholders (`%s`, `%d`, `%1$s`) and Python-style named placeholders
(`%(name)s`) are extracted and guarded across translation.
