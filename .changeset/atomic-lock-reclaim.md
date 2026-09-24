---
"@verbatra/sdk": minor
---

Reclaim an abandoned write lock atomically through a new optional `SdkFs.rename` member.

Previously clearing an abandoned reclaim guard and reclaiming a dead holder's lock read the file
and then deleted it, so a lock another process took between the two steps could be deleted. A
guard had to be seen unchanged across two polls before it was cleared, which narrowed that window
but could not close it.

Now the default file system implements `rename`, and the lock moves the abandoned file aside under
a unique `<name>.<pid>.<uuid>.stale` name, deletes it only when it is still the record it checked,
and puts anything else back with `createExclusive`. An abandoned guard is cleared the first time it
is seen. A custom `SdkFs` without `rename` keeps the previous read-then-delete and two-sighting
behaviour.
