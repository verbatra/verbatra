---
"@verbatra/sdk": patch
---

Attribute a throw from a third-party adapter's parser to the adapter, with the original error as
`cause`.

Previously a `custom:` adapter built on `createTreeFileAdapter` or `createFlatFileAdapter` whose
`parse` or `parseEntries` threw was reported as `INVALID_STRUCTURE` ("The file could not be
parsed."), naming no format and dropping the original error, so the documented `ADAPTER_FAILED`
attribution never applied.

Now that throw surfaces as an `AdapterError` with code `ADAPTER_FAILED` naming the format, and its
`cause` is the original error. An `AdapterError` the plugin raises itself and an errno failure keep
their own codes, and built-in adapters report `INVALID_STRUCTURE` as before, now with the parser's
error as `cause`. `AdapterError` accepts an optional `{ cause }` as its third argument.
