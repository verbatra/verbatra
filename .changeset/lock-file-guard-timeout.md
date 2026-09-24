---
"@verbatra/sdk": patch
---

Apply the run's lock timeout to the lock-file guard each locale takes.

Previously `translate` and `watch` waited up to ten minutes for the lock-file guard a locale takes
to record its result, whatever `lockAcquireTimeoutMs` said, and never reported that wait to
`onLockWait`.

Now that guard uses the run's `lockAcquireTimeoutMs` and `onLockWait`, so a guard held past the
timeout fails that locale with `LOCK_CONTENDED` on its summary and the other locales carry on.
