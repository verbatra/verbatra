---
"@verbatra/sdk": patch
---

Keep a locale file's layout when verbatra writes to it.

Previously a new Android `strings.xml` entry was appended on the line of the closing tag with no
indentation, and a file verbatra created held every resource on one line; Android and XLIFF files
lost their trailing newline on every write; a new gettext entry followed the previous one with no
blank line between them, and a `.po` file verbatra created had no `Language` header.

Now the XML writers keep the file's line terminator and trailing line break and indent a new
element like its siblings, a new `<plurals>` item one level deeper, and a created Android file puts
one resource on each indented line. A new gettext entry is preceded by a blank line, and a created
`.po` file names its locale in a `Language` header, such as `pt_BR` for `pt-BR`. The
`serializeEntries` of a `createFlatFileAdapter` adapter now also receives the locale being
written, as its fifth argument.
