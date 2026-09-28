---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Build the review queue from the committed files, and approve a whole locale at once.

Previously `reviewQueue` listed the keys the last `translate` or `watch` run on this machine
flagged, read from the gitignored `.verbatra-local/run-status.json`, so imports, edits, and
teammates never showed up in it. It now lists every key whose current value a provider, the
translation memory, a fuzzy match, or an AI agent wrote (the new `MACHINE_CLASS_ORIGINS`) and that
nobody has approved, read from the locale files, `verbatra.lock.json`, and
`verbatra.provenance.json`, so every teammate and CI job with the same commit sees the same queue.
The last run's flags only add detail: each entry's `reasons` (empty when the run gave none) and the
locale's `fuzzyHits`. This changes the result shape: `available: false` now means the provenance
file cannot be read and carries `reason: "provenance-unreadable"`; a locale no longer carries the
run's `status` or `usage` (read them with `runStatus`); the run's time is `lastRunAt`; and every
entry's `provenance` is always present. The new `locales` input narrows the queue, and
`includeApproved` also lists each locale's approved values. A source or target file or lock file
that cannot be read now fails the call as it fails `check`.

The new `approveLocale` approves every value in a locale's queue, optionally only some origins, in
one write of the provenance file, and lists the keys it left because their source changed.

Editing an approved value still drops the approval: an edit through `editEntry`, Studio, or MCP, a
retranslation, an import, and a hand edit of the locale file (detected by the stored value hash)
all do. A machine write puts the key back in the queue; a person's write leaves it out.
