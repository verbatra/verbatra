---
"@verbatra/sdk": patch
---

Refuse a single-key edit or retranslation before writing when the lock-file went bad after the call started.

- **editEntry and retranslateEntry:** the lock-file is checked again inside the write lock, just before the locale file is written. A merge conflict that lands in `verbatra.lock.json` while a retranslation waits on the provider now fails with `LOCK_FILE_INVALID` and leaves the locale file as it was, instead of saving the value without recording its baseline.
- **Upgrade:** in that situation the call used to throw after the new value was already written; it now throws with nothing written (the provider call is still spent). Restore `verbatra.lock.json` from version control and run the call again.
