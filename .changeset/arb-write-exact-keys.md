---
"@verbatra/sdk": patch
---

Write exactly the given messages to a Flutter ARB file, so prune and reject can remove a key.

Previously the ARB writer kept every message already in the destination file, so
`translate --prune` left orphaned keys in place and `rejectEntry` refused ARB with
`REVIEW_REJECT_UNSUPPORTED`.

Now a message left out of the write is dropped together with its `@key` block, while `@@`-prefixed
globals such as `@@locale` are kept, and rejecting a value in an ARB project removes it.
