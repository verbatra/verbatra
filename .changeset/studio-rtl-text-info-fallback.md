---
"@verbatra/studio": patch
---

Fall back to the locale's script when the engine fails to report a text direction.

Previously a browser whose `Intl.Locale` text info threw rendered every locale left to right,
including Arabic and Hebrew. The dashboard now derives the direction from the locale's likely
script in that case, and remembers the result per locale tag.
