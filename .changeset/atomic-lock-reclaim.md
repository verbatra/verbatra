---
"@verbatra/sdk": minor
---

Reclaim and release write locks through a new optional `SdkFs.rename`, check lock ownership before
every protected write, and add a lock heartbeat through new optional `SdkFs.touch` and
`SdkFs.mtimeMs` members.

Previously clearing an abandoned reclaim guard and reclaiming a dead holder's lock read the file
and then deleted it, so a lock another process took between the two steps could be deleted, and a
holder deleted its lock on release whatever the file then held. A lock record put back for a
process that had already released it blocked other writers until that process exited.

Now the default file system implements `rename`, `touch`, and `mtimeMs`. The lock moves a file
aside under a unique `<name>.<pid>.<tag>.<uuid>.stale` name, deletes it only when it is the record
it expected, and puts anything else back with `createExclusive`, deleting a record it cannot put
back because a third process took the path. Release does the same, so it never deletes another
process's lock, and falls back to a read-then-delete with retries when its rename fails. A reclaim
guard records no heartbeat and is cleared only once its process is gone, after two identical
sightings a poll apart. A rename refused with `EPERM`, `EBUSY`, or `EACCES` (Windows, for a file
another process has open) is retried on the next poll instead of failing.

Each lock records a random ownership token, and the holder checks it before every write the lock
protects (locale file, lock file, provenance file, glossary) and on release, failing with
`LOCK_CONTENDED` without writing when another process has taken the lock over. A lock file found
missing or replaced on release fails an operation that succeeded the same way. The check and the
write are two steps with nothing bounding the time between them: a holder paused after the check
(sleep, `SIGSTOP`, a debugger, a clock step, a long event-loop block) stops its heartbeat, is taken
over once its lock is 30 seconds old, and can still write once when it resumes. A custom `SdkFs`
must let `readFileBounded` read back what `createExclusive` created.

A holder touches its lock file right after creating it, with its own clock, and every 10 seconds
after, and a waiter treats a lock on its own machine whose process is alive but whose file is three
recorded intervals old as abandoned. A moved-aside file is touched too, and leftover `.stale` files
are deleted on the next acquisition once their mover is gone or they are older than that threshold
since the move (on a file system without `touch`, only once their mover is gone), and are safe to
delete by hand. A custom `SdkFs` without
`rename` keeps the read-then-delete behaviour; one without `touch` and `mtimeMs` judges a lock by
its process alone.
