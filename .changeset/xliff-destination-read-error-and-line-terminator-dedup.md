---
"@verbatra/sdk": patch
---

Fix the XLIFF adapter's destination-read error message so a non-ENOENT read failure (permission denied, a directory in place of a file, and similar) no longer claims the destination file does not exist; only the genuine ENOENT case keeps that message, and both cases still raise the same structured `INVALID_STRUCTURE` error. Also deduplicate the `LineTerminator` type, `detectLineTerminator`, and `splitPhysicalLines` helpers, previously copied near-identically across the properties, Apple `.strings`, and gettext adapters, into the package's shared `shell.ts` module with no change in behavior.
