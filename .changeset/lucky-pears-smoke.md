---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Generate TypeScript declarations for your catalog keys and their message arguments

`generateTypes` reads the source catalog through the configured format adapter and writes a declaration file: a union of every key the catalog holds and, per key, the arguments its message interpolates. Type a translation function against it and a misspelled key or a missing interpolation argument becomes a compile error instead of a runtime lookup failure.

The new `verbatra types` command runs it, and `verbatra types --check` exits 1 when the committed declaration no longer matches the catalog, which is the shape a CI gate wants. Neither constructs a provider, reads an API key, nor makes a network request.

Nothing is re-parsed: keys and placeholder tokens are exactly what the adapter already produced, in document order, so two runs over an unchanged catalog write byte-identical bytes. Every key is emitted as a quoted string literal, so one carrying a dot, a reserved word, a leading digit, a quote or nothing at all is declared verbatim. A message whose syntax the adapter reported as invalid, one that appears to both name and number its arguments, and one whose placeholder index is out of range are all declared with their arguments reported as undetermined rather than silently declared as taking none. The output path is refused before anything is read or written when it is absolute, climbs out of the working directory, is not a TypeScript file, or names a locale file, the lock file, the translation-memory cache, or a file verbatra loads its configuration from.
