---
"@verbatra/mcp": patch
---

Add a package-local in-flight guard for the `translation.retranslateEntry` and `translation.editEntry` tools, keyed per `(tool, locale, key)`. A second overlapping call for the same locale and key returns an error result before reaching the provider, so an accidental duplicate call (for example an LLM client retrying a slow request) can no longer bill the configured provider twice for one logical request. A concurrent call for a different key is unaffected.
