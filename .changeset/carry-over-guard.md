---
"@verbatra/sdk": patch
---

Carry a respelled locale's state over without failing the run.

Previously every live `translate` run took the lock-file guard with the default ten-minute wait,
ignoring `lockAcquireTimeoutMs` and `onLockWait`, a contended guard or an unwritable state file
failed the whole run, and a dry run ignored moved provenance records.

Now the guard is taken only when there is state to move, with the run's timeout and wait
listener. A contended guard or a failed write leaves the state where it is and reports the new
`LOCALE_STATE_CARRY_OVER_SKIPPED` notice on the locale, and a dry run plans with the moved
provenance records, so protected keys match the live run.
