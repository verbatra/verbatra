---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Bound and report the lock waits of an import: `importWorkbook({ lockAcquireTimeoutMs, onLockWait })`
and `verbatra import --lock-timeout <seconds>`.

Previously an import waited the full ten-minute default on a held per-locale write lock, with no way
to shorten the wait and no sign on the terminal that it was waiting at all.

Now `importWorkbook` takes the same two options as `translate`, with the same meaning:
`lockAcquireTimeoutMs` bounds the wait for a locale's write lock before its file is written, and a
locale still contended after it fails with `LOCK_CONTENDED` on its own summary while the other
locales import. Recording a written file in the lock file still waits up to the default, so a
written file is never left unrecorded. `verbatra import` accepts `--lock-timeout` with the same
limits as `translate` (1 to 3600 seconds, otherwise `INVALID_LOCK_TIMEOUT`, exit 2) and prints the
same waiting line on stderr, or a `lock-wait` JSON record under `--json`.
