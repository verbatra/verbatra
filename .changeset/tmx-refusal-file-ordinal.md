---
"@verbatra/sdk": patch
---

Report a refused TMX unit by its ordinal in the file.

Previously `importTmx` numbered `refusals` by the unit's position among the units it read, so a
skipped `tu` (one with no segment) before a refused unit shifted every later ordinal.

Now `unit` counts every `tu` in the file's first `body`, as documented and as import errors do.
