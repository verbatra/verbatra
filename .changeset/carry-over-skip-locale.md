---
"@verbatra/sdk": patch
---

Hold back a locale whose respelled state could not be moved, so the next run retries the move.

Previously, when the lock-file guard stayed contended or a state file could not be written during
the carry-over from a respelled code such as `pt_BR` to `pt-BR`, the locale still ran and recorded
its lock and provenance under `pt-BR`. Later runs never retried the move, and the protection and
rejection records left under `pt_BR` no longer applied, so a person's edit could be overwritten and
rejected text could come back.

Now that locale does not run: it fails with the new `LOCALE_STATE_NOT_CARRIED_OVER` code, reports
`LOCALE_STATE_CARRY_OVER_SKIPPED`, nothing is written under the new code, and the next run tries
the move again. The other locales run as usual. A dry run reports the locale the same way while
another process holds the lock-file guard. When only the translation memory cannot be written, the
locale still runs, since the memory is only a cache.
