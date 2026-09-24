---
"@verbatra/sdk": patch
---

Write exactly the given messages to a Flutter ARB file, so prune and reject can remove a key.

Previously the ARB writer kept every message already in the destination file, so
`translate --prune` left orphaned keys in place.

Now a message left out of the write is dropped together with its `@key` block, while `@@`-prefixed
globals such as `@@locale` are kept, and `rejectEntry` can remove a value from an ARB file.
