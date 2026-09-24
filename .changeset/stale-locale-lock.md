---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Reclaim a write lock left behind by a process that is no longer running, and release held locks on
an interrupt.

Previously a lock file left by a killed process (for example `watch` force-stopped with a second
Ctrl-C) made the next run wait the full lock timeout and then fail with `LOCK_CONTENDED`.

Now each lock records the holder's host name as well as its pid. A waiting run reclaims a lock
whose holder ran on the same machine and no longer exists, serialized so two waiting runs never
take over the same lock. Locks from another machine or from an older version are never reclaimed.
The new `releaseHeldLocks()` deletes the locks the current process holds, and the CLI calls it
when an interrupt stops `translate` or `import` and when a second interrupt force-stops `watch`.
