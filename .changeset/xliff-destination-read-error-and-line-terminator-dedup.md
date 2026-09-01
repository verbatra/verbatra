---
"@verbatra/sdk": patch
---

Fix the XLIFF adapter's destination-read error message incorrectly claiming a
file does not exist for non-ENOENT failures (permission denied, a directory in
place of a file); both cases still raise the same structured error. Also
deduplicates line-terminator detection helpers shared across the properties,
Apple `.strings`, and gettext adapters, with no behavior change.
