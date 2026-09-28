---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Spell a script the gettext way under the `posix` locale style for the `gettext-po` format.

Previously `files.localeStyle: "posix"` joined a script with an underscore for every format, so a
gettext project configured with `sr-Latn` or `zh-Hant-TW` looked for `sr_Latn` and `zh_Hant_TW`,
names gettext and glibc do not use.

Now a `gettext-po` project follows the gettext locale name convention. A script the language and
region already imply is left out, so `zh-Hant-TW` is written `zh_TW` and `sr-Cyrl-RS` `sr_RS`.
`Latn`, `Cyrl` and `Deva` become the `@latin`, `@cyrillic` and `@devanagari` modifiers, so
`sr-Latn` is written `sr@latin`, `sr-Latn-RS` `sr_RS@latin` and `uz-Cyrl` `uz@cyrillic`. A numeric
region stays as before: `es-419` is written `es_419`. Any other script, such as `zh-Hant` without a
region, is refused with `LOCALE_LAYOUT_INVALID`, and the message names the locale and the supported
modifiers. Every other format keeps the ICU spelling (`sr_Latn`, `zh_Hant_TW`) that Java resource
bundles and Flutter ARB files use.

`init` detection reads `sr@latin` or `sr_RS@latin` in an existing layout back to `sr-Latn` or
`sr-Latn-RS`. A config code written the gettext way, such as `sr@latin`, is rejected as before, and
the message now suggests `sr-Latn` with the `posix` style. State recorded under such a code is
carried over to the respelled one on the next `translate` run, like an underscore spelling.

A `.po` catalogue verbatra creates now writes the same gettext name in its `Language` header
(`sr@latin`, `zh_TW`, `es_419`) instead of an underscore spelling such as `sr_Latn`.

The `init` next step that names the source locale's file next to a base file (a `.pot` template, a
Java base bundle) now spells that file through the same path resolver the runs use, so a
`sr-Latn` source in a gettext layout is named `locale/sr@latin/LC_MESSAGES/app.po`. A source
locale the layout cannot spell gets no such step.
