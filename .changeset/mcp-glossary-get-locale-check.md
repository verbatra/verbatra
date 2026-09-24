---
"@verbatra/mcp": patch
---

Check `glossary.get`'s `locale` against the configured target locales in the tool itself.

The SDK's `readCurrentGlossary` no longer takes a `locale`, since it only validated it and never
used it. `glossary.get` now makes the same check before reading the glossary, so an unconfigured
locale is still refused with `UNKNOWN_LOCALE` naming the configured ones, unchanged.
