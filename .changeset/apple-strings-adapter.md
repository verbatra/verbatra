---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `apple-strings`, a ninth supported format, for Apple's `.strings` localization
files used by iOS and macOS projects. It reads and writes flat `"key" = "value";`
statements, extracting a leading `/* ... */` block comment as read-only description
context and printf-style placeholders (`%@`, `%d`, `%1$@`, the escaped `%%` literal)
that are guarded across translation the same way every other format's placeholders
are. A positional reorder such as `%1$@ %2$@` becoming `%2$@ %1$@` is accepted, and a
bare `%` followed by ordinary text, as in `"50% off"`, extracts nothing.

Encoding is UTF-8 only: a UTF-16 byte-order mark, little or big endian, is detected
and rejected with a structured `INVALID_STRUCTURE` error instead of being parsed
into corrupt, NUL-interleaved keys, since Xcode's `genstrings` can still emit
UTF-16. A write re-reads the destination and preserves its key order, comments, and
blank lines; a `.strings` file that does not exist yet is synthesized from the
entries, matching the Java/Spring properties format's behavior rather than XLIFF's.
`files.pattern` addresses Apple's per-locale bundle layout directly, for example
`{locale}.lproj/Localizable.strings`; a write creates a missing `{locale}.lproj`
directory the same way it creates any other missing destination directory.

This is slice 1 of Apple format support: plurals live in the sibling `.stringsdict`
file, a separate format tracked as a follow-up and out of scope here.
