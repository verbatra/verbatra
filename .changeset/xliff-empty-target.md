---
"@verbatra/sdk": patch
---

Treat an empty or missing XLIFF target as untranslated instead of copying the source into it.

Previously a unit whose `<target>` was empty or absent read as its `<source>` text, so the key
was never sent to the provider, a lock baseline was written for it, the source was copied into
the target, and `check` reported the locale in sync.

Now a translation document is read from its targets only: a missing, empty, or XLIFF 1.2
`state="new"` or `state="needs-translation"` target is reported missing and translated on the
next run, and writing into such a target sets its state to `translated`. A document is read from
its sources when the locale matches its declared source language and it does not declare that
locale as its target. A created target is placed right after `<source>`, as XLIFF 1.2 requires.
`createFlatFileAdapter`'s `parseEntries` now also receives the locale the file is read as.
