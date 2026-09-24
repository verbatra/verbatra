---
"@verbatra/sdk": patch
---

Never reuse a translation-memory hit whose text a reviewer rejected for that key.

Previously `rejectEntry` dropped the rejected text from the local memory only, so a teammate's
memory or a fuzzy hit could write the same text back on the next `translate` or `watch` run.

Now a run skips any exact or fuzzy memory hit whose value hash matches the key's `rejected`
provenance record, under every `humanEdits` setting, and sends the key to the provider instead.
With provider `none` the key stays unfilled until someone writes a value.
