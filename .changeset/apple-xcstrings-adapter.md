---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `apple-xcstrings`, a new supported format, for Apple's Xcode String Catalog
(`.xcstrings`) files, which hold every locale in one JSON document rather than
one file per locale. Plural categories and printf placeholders are handled the
same way as the `apple-strings` format. Because all locales share one physical
file, writes to an `apple-xcstrings` catalogue are serialized, so concurrency
above 1 no longer parallelizes operations for this format specifically. Writes
patch only the touched localizations, leaving everything else in the document
untouched.
