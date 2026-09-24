---
"@verbatra/sdk": patch
---

Reclaim an abandoned write lock only when the holder provably shared this process table.

Previously a matching host name was enough to judge a recorded holder dead, so two containers that
share a host name and a lock directory could reclaim each other's live lock. A waiter also deleted
an abandoned `.reclaim` guard in the same poll it first saw it, which could remove a fresh guard
another waiter had just put in its place, a reclaim with a zero acquire timeout failed with
`LOCK_CONTENDED` right after it succeeded, and a guard that could not be deleted surfaced as a raw
file-system error.

Now each lock also records the kernel boot ID and PID namespace on Linux, and a lock is reclaimed
only when every recorded identity field matches the waiting process. A guard is deleted only after
the same abandoned guard is seen again at least one poll interval later, the deadline is not checked
after a successful reclaim, and a failure to delete the waiter's own guard is ignored, while a
failure to delete an abandoned lock or guard is reported as `LOCK_CONTENDED` with the file-system
error as its cause. On Linux, a lock left by an earlier version, which records no boot ID, is never
reclaimed automatically: delete it by hand once no verbatra process is running.
