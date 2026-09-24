---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Reclaim a write lock left behind by a process that is no longer running, and release held locks on
an interrupt.

Previously a lock file left by a killed process (for example `watch` force-stopped with a second
Ctrl-C) made the next run wait the full lock timeout and then fail with `LOCK_CONTENDED`.

Now each lock records the holder's host name and pid, and on Linux also the kernel boot ID and PID
namespace. A waiting run reclaims a lock only when every recorded identity field matches its own,
so the holder provably shared this process table, and that holder no longer exists. Reclaims are
serialized so two waiting runs never take over the same lock, and an abandoned reclaim guard is
deleted only after it is seen again at least one poll interval later. A failure to delete an
abandoned lock or guard is reported as `LOCK_CONTENDED` with the file-system error as its cause.
A lock file too large to be a lock cannot be read, so it fails with `LOCK_CONTENDED` at once,
naming the file, instead of after the full lock timeout.
Locks from another machine, from another container sharing the host name, or from an older version
are never reclaimed: delete such a lock by hand once no verbatra process is running. The new
`releaseHeldLocks()` deletes the locks the current process holds, and the CLI calls it when an
interrupt stops `translate` or `import` and when a second interrupt force-stops `watch`.
