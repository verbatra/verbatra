---
"@verbatra/sdk": minor
---

Carry lock-file, translation-memory and provenance state over when a locale code is respelled.

Previously, renaming a target locale such as `pt_BR` to `pt-BR` (with `files.localeStyle: "posix"`
so the file keeps its name) left the old state behind: the `pt_BR` lock block, memory entries and
provenance records were orphaned, and the new `pt-BR` lock block started empty, so a source change
made before the rename was never retranslated.

Now `translate` and `watch` move that state to the configured code once, before the locale runs,
when the configured code has no state of its own in a file and that file holds state under exactly
one underscore spelling of it (compared case-insensitively). The locale reports the new
`LOCALE_STATE_CARRIED_OVER` notice naming both codes and the files moved. State the configured code
already has is never overwritten, and two competing spellings move nothing. A dry run plans with
the moved state, provenance records included, so protected keys match the live run, and writes
nothing; a run with the cache off leaves the translation memory alone.

The move takes the lock-file guard only when there is state to move, with the run's
`lockAcquireTimeoutMs` and `onLockWait`. When the guard stays contended, the lock or provenance file
cannot be written, or its guard cannot be read, the state stays where it is, the locale reports the
new `LOCALE_STATE_CARRY_OVER_SKIPPED` notice and does not run: it fails with the new
`LOCALE_STATE_NOT_CARRIED_OVER` code, nothing is written under the new code, and the next run tries
the move again. The other locales run as usual. A dry run reports the locale the same way while
another process holds the lock-file guard, and treats a guard it cannot read as held, naming the
unreadable guard as the reason rather than failing. When only the translation memory cannot be
written, the locale still runs, since the memory is only a cache.

`doctor` gains an informational `locale-state` check that names every locale the lock file,
translation memory or provenance file holds state for that the config does not list, says whether
the next `translate` run carries it over, and otherwise suggests removing it or respelling the
configured locale.
