---
"@verbatra/sdk": patch
---

Add an XLIFF unit the target document lacks instead of silently dropping its translation.

Previously a key present in the source XLIFF but missing from the target document was sent to
the provider, billed, reported as translated and recorded in the lock, yet no unit was written,
and later runs kept it as a cache hit that never reached the file.

Now the writer appends a copy of the source unit (its `id`, `resname` and other attributes, notes
and `<source>`, without its own targets or `alt-trans`) with the new `<target>`, and a value it
cannot place fails the write with `INVALID_STRUCTURE` naming the key rather than being reported as
written. Writing the source file itself updates `<source>` and appends new keys as source-only
units, so `extract` adds them; a key that is not a valid XLIFF 2.0 unit id, such as `u1#0`, is
refused rather than appended.
`FormatAdapter.write` takes an optional `WriteContext` carrying the source file's path, which
`createFlatFileAdapter` passes on to `serializeEntries`.
