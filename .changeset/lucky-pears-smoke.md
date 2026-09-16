---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Generate TypeScript declarations for your catalog keys and their message arguments

`generateTypes` reads the source catalog through the configured format adapter and writes a declaration file: a union of every key the catalog holds and, per key, the arguments its message interpolates. Type a translation function against it and a misspelled key or a missing interpolation argument becomes a compile error instead of a runtime lookup failure.

The new `verbatra types` command runs it, and `verbatra types --check` exits 1 when the committed declaration no longer matches the catalog, which is the shape a CI gate wants. Neither constructs a provider, reads an API key, nor makes a network request.

Keys are exactly what the adapter produced, in document order, so two runs over an unchanged catalog write byte-identical bytes. Every key is emitted as a quoted string literal, so one carrying a dot, a reserved word, a leading digit, a quote or nothing at all is declared verbatim. For `next-intl-json` and `arb`, each message is read with the same ICU parser the adapter uses, so an argument only some `select` or `plural` branches use is declared as optional instead of being left out, and one every branch uses stays required. Arguments are typed by how the message formats them: `plural`, `selectordinal` and `number` declare `number`, ICU `date` and `time` and an i18next `datetime` formatter declare `Date | number`, `select` declares `string`, and a plain argument keeps `string | number`. An i18next unescaped interpolation such as `{{- name}}` is declared as `name`. A message whose syntax the adapter reported as invalid, one that appears to both name and number its arguments, and one whose placeholder index is out of range are all declared with their arguments reported as undetermined rather than silently declared as taking none, and they are not counted among the keys taking arguments.

The output path is refused before anything is read or written when it names no file, is absolute, climbs out of the working directory, is not a TypeScript file, or names a locale file, the lock file, the translation-memory cache, a file verbatra searches for its configuration, or the config file the run actually loaded, including one named with `--config`. A generating run also refuses to replace an existing file that does not begin with the header verbatra writes, and leaves it untouched; `--check` only compares.
