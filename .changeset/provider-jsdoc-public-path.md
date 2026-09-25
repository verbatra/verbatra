---
"@verbatra/sdk": patch
---

Describe how to plug in a custom `TranslationProvider` without naming a repository file.

Previously its documentation told readers to add an entry to a factory table in
`packages/sdk/src/config/provider-config.ts`, a file that is not part of the published package.
It now points to the `createProvider` dependency of `translate`, `watch` and `retranslateEntry`.
