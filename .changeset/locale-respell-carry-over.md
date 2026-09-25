---
"@verbatra/sdk": minor
---

Carry lock-file, translation-memory and provenance state over when a locale code is respelled.

Previously, renaming a target locale such as `pt_BR` to `pt-BR` (with `files.localeStyle: "posix"`
so the file keeps its name) left the old state behind: the `pt_BR` lock block and memory entries
were orphaned, and the new `pt-BR` lock block started empty, so a source change made before the
rename was never retranslated.

Now `translate` and `watch` move that state to the configured code once, before the locale runs,
when the configured code has no state of its own in a file and that file holds state under exactly
one underscore spelling of it (compared case-insensitively). The locale reports the new
`LOCALE_STATE_CARRIED_OVER` notice naming both codes and the files moved. State the configured code
already has is never overwritten, and two competing spellings move nothing. A dry run plans with
the moved state, provenance records included, so protected keys match the live run, and writes
nothing; a run with the cache off leaves the translation memory alone.

The move takes the lock-file guard only when there is state to move, with the run's
`lockAcquireTimeoutMs` and `onLockWait`. When the guard stays contended, the lock or provenance file
cannot be written, or its guard cannot be read or created, the state stays where it is, the locale
reports the new `LOCALE_STATE_CARRY_OVER_SKIPPED` notice and does not run: it fails with the new
`LOCALE_STATE_NOT_CARRIED_OVER` code, nothing is written under the new code, and the next run tries
the move again. The other locales run as usual. A dry run reports the locale the same way while
another process holds the lock-file guard, and treats a guard it cannot read as held, naming the
unreadable guard as the reason rather than failing. When only the translation memory cannot be
written, the locale still runs, since the memory is only a cache.

Until a run moves it, every read-only report reads state still recorded under that one underscore
spelling as the configured code's, without moving or writing anything: `check`, `diff`,
`lockState`, `keyIntegrity`, `keyValue`, `localeValues`, `reviewQueue`, `exportWorkbook` and
`exportTmx`. So `verbatra check` and `verbatra diff` exit 1, `verbatra export` hands off the stale
keys, and the MCP tools and Studio report the keys a run would retranslate, including their
recorded origins and review decisions. `importTmx` matches against the remembered translations
the same way.

The writes that record state for one locale move it first, the same way and under the same
guard: `editEntry`, `retranslateEntry`, `approveEntry`, `rejectEntry` and `importWorkbook` (a
dry-run import reads the moved baseline and writes nothing). When the move cannot be made, the
single-key writes fail with `LOCALE_STATE_NOT_CARRIED_OVER` and write nothing, and an import fails
that locale with it, so no decision or value is recorded under the new code while the old records
stay unapplied.

`doctor` gains an informational `locale-state` check that names every locale the lock file,
translation memory or provenance file holds state for that the config does not list, says whether
the next `translate` run carries it over, and otherwise suggests removing it or respelling the
configured locale.
