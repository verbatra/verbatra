---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `android-xml`, an eleventh supported format, for Android's resource files:
`res/values/strings.xml` for the source locale and `res/values-<qualifier>/strings.xml`
for every target, detected by the `.xml` extension. Set `files.localeStyle` to
`android` so `{locale}` in `files.pattern` expands to the right resource-qualifier
directory (`values`, `values-de`, `values-pt-rBR`, and the BCP-47 `values-b+...`
fallback for scripts and variants) instead of a literal BCP-47 tag; the locale-path
resolver already supported this style, so no SDK path-layer change was needed.

A `<string name="key">value</string>` is one entry. A `<plurals name="key">`
becomes one entry per `<item quantity="...">` (`zero`, `one`, `two`, `few`, `many`,
`other`), keyed as `key[quantity]`, for example `count[one]` and `count[other]`;
this bracketed encoding, rather than the `<key>_<category>` suffix other formats
use, keeps a hostile resource name from forging a collision with real plural key
space, since every `name` is validated against Android's identifier grammar before
it becomes a key. A locale that supplies only some quantities round-trips with
exactly those: none is fabricated and none is dropped.

`translatable="false"` on a `<string>` or `<plurals>` excludes it from translation
entirely: it is never sent to a provider and is left untouched on disk.
`formatted="false"` is translated normally, since the attribute only disables
Android's own printf-argument validation, not localization. A `<string-array>` and
a `<string>` containing inline markup (`<b>`, `<xliff:g>`, a `CDATA` section) are
preserved exactly as they are and never enter the translatable set; item-level
translation for these is a possible future addition, not this one.

Placeholders are printf-style (`%s`, `%d`, `%1$s`, the escaped literal `%%`); a
bare `%` followed by ordinary text extracts nothing, since the extractor does not
treat a space as a valid conversion flag the way Java's own `String.format` does.
Escaping (`\'`, `\"`, `\n`, `\t`, a leading `\@` or `\?`) is decoded on read and
re-encoded on write, symmetrically; XML's own `&`, `<`, and `>` entities are
handled independently by the underlying XML layer, so a translated value
containing any of them is written back safely with no manual escaping required.

Writes update an existing destination in place, preserving element order,
attributes, and comments, and create the parent directory for a destination that
does not exist yet. Known v1 limitation: a key already translated in a target file
that is later reclassified read-through in the source (gains `translatable="false"`
or inline markup, without being removed) is indistinguishable, at the destination
alone, from a key genuinely removed from source. It is pruned only when the run
has pruning enabled (`--prune`, or the config's `prune` option; off by default);
an ordinary `verbatra translate` run leaves the stale-but-valid translation in
place untouched. This is narrow and recoverable through version control or a
fresh translate run; it does not affect ordinary new, changed, or removed keys.

Malformed XML raises a structured `AdapterError` naming the problem: a document
whose root element is not `<resources>`, a resource name that fails the identifier
grammar, a `<plurals>` item with a quantity outside the CLDR set, and two elements
resolving to the same key are all reported specifically rather than as a generic
parse failure. A DTD or entity declaration is rejected outright.
