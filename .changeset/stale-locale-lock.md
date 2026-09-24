---
"@verbatra/sdk": minor
"@verbatra/cli": patch
---

Reclaim a write lock left behind by a process that is no longer running, never delete another
process's lock, and release held locks on an interrupt.

Previously a lock file left by a killed process (for example `watch` force-stopped with a second
Ctrl-C) made the next run wait the full lock timeout and then fail with `LOCK_CONTENDED`, as did a
lock file too large to be a lock, and a holder deleted its lock file on release whatever the file
then held.

Now each lock records the holder's host name and pid, on Linux also the kernel boot ID and PID
namespace, and a random ownership token. A waiting run reclaims a lock when every recorded identity
field matches its own, so the holder provably shared this process table, and that holder no longer
exists. A holder also touches its lock file right after creating it, with its own clock, and every
10 seconds after, and a waiter treats a lock on its own machine whose process is alive but whose
file is three recorded intervals old as abandoned. Reclaims are serialized through a reclaim guard,
so two waiting runs never take over the same lock; a guard records no heartbeat and is cleared only
once its process is gone, after two identical sightings a poll apart. A lock file too large to be
a lock fails with `LOCK_CONTENDED` at once, naming the file.

Reclaiming and releasing go through the new optional `SdkFs.rename`, and the heartbeat through the
new optional `SdkFs.touch` and `SdkFs.mtimeMs`; the default file system implements all three. The
lock moves a file aside under a unique `<name>.<pid>.<tag>.<uuid>.stale` name, deletes it only when
it is the record it expected, and puts anything else back with `createExclusive`, deleting a record
it cannot put back because a third process took the path. Release does the same, so it never
deletes another process's lock, and falls back to a read-then-delete with retries when its rename
fails. A rename refused with `EPERM`, `EBUSY`, or `EACCES` (Windows, for a file another process has
open) is retried on the next poll, and a reclaim that fails for another reason is reported as
`LOCK_CONTENDED` with the file-system error as its cause. Leftover `.stale` files are touched when
moved, deleted on the next acquisition once their mover is gone or they are older than the stale
threshold since the move (on a file system without `touch`, only once their mover is gone), and are
safe to delete by hand. A custom `SdkFs` without `rename` reclaims and releases with a
read-then-delete; one without `touch` and `mtimeMs` judges a lock by its process alone, and it must
let `readFileBounded` read back what `createExclusive` created.

The holder checks its ownership token before every write the lock protects (locale file, lock
file, provenance file, glossary) and on release, failing with `LOCK_CONTENDED` without writing when
another process has taken the lock over, and a lock file found missing or replaced on release fails
an operation that succeeded the same way. The check and the write are two steps with nothing
bounding the time between them: a holder paused after the check (sleep, `SIGSTOP`, a debugger, a
clock step, a long event-loop block) stops its heartbeat, is taken over once its lock is 30 seconds
old, and can still write once when it resumes.

Locks from another machine, from another container sharing the host name, or from an older version
are never reclaimed: delete such a lock by hand once no verbatra process is running. The new
`releaseHeldLocks()` deletes the locks the current process holds, and the CLI calls it when an
interrupt stops `translate` or `import` and when a second interrupt force-stops `watch`.
