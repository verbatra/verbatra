# Respelled locale codes

When a configured code is respelled, such as `pt_BR` to `pt-BR`, the lock file,
translation memory and provenance file may still hold that locale's state under
the old spelling. `translate` and `watch` move it to the configured code once,
before the locale runs, and never overwrite state the new code already has; the
locale reports the notice `LOCALE_STATE_CARRIED_OVER` (a dry run reports what it
would move and moves nothing). If the move cannot happen, because another process
holds the lock-file guard past the lock timeout or a file cannot be written, the
locale reports `LOCALE_STATE_CARRY_OVER_SKIPPED`. When the lock file or the
provenance file is among those left behind, the locale does not run at all: it
fails with `LOCALE_STATE_NOT_CARRIED_OVER`, so its protection and rejection records
are not lost, and the next run tries again. When only the translation memory stayed
behind, the locale runs without those cached translations. `doctor`'s
`locale-state` check shows what is waiting to move. `check` and `diff` read the
old spelling's state as the configured code without moving anything, so a CI gate
reports its stale keys and exits `1` before the next `translate`.
