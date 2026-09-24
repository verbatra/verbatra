---
"@verbatra/sdk": patch
---

Tighten a few error paths and messages.

Previously a glossary lock that could not be released was said to stay in place until the process
exits, a source XLIFF file that failed to parse dropped the parser's error, and the `types` output
refusals were checked by a copy of the shared output-path rules.

Now the glossary message says the lock stays until a later run reclaims it after this process
exits, the XLIFF refusal carries the parser's error as its `cause`, and `types` reuses the shared
output-path refusal with unchanged messages.
