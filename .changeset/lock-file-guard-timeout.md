---
"@verbatra/sdk": patch
---

Scope the run's lock timeout to the waits that happen before any provider call.

Previously `translate` and `watch` waited up to ten minutes for the lock-file guard a locale takes
to record its result, whatever `lockAcquireTimeoutMs` said, and never reported that wait to
`onLockWait`.

Now `lockAcquireTimeoutMs` bounds the locale write lock taken before the provider is called, so a
locale that times out there has called no provider and written no file. The lock-file guard taken
to record a written file keeps the ten-minute default, so a locale whose file was written is always
recorded in the lock file and the provenance file. `onLockWait` reports that wait too, first once
it has lasted a second, and never for a lock this process holds itself, such as the guard a sibling
locale holds on a run with `concurrency` above 1. A lock whose file cannot be read is treated as
held rather than failing the check.
