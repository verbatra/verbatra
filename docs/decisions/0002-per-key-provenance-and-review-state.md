# 2. Per-key provenance and review state

- Status: accepted
- Date: 2026-09-23

## Context

`verbatra.lock.json` records one thing per key and target locale: the content hash of the source
entry the current translation was produced from (`packages/sdk/src/lock/types.ts`,
`packages/sdk/src/lock/lock-file.ts`). That is enough to detect drift and nothing more. Nothing
records who or what produced a value, whether anyone looked at it, or whether the value on disk is
still the one verbatra wrote.

Three planned workflows cannot be built without that record:

- **Protecting human work.** When a source string changes, the next `translate` classifies the key
  as `changed` and machine-translates over whatever the target holds
  (`packages/sdk/src/flow/locale-run.ts`, `runLocale`), including a value a professional
  translator wrote. Protection needs to know, per key, that the current value is human work.
- **A persisted review workflow.** The only review state today is the `needsReview` list in
  `.verbatra-local/run-status.json`, which is gitignored, written only by `translate` and `watch`,
  and replaced on every run (`packages/sdk/src/run-status/run-status-file.ts`). Studio's Approve and
  Reject buttons only hide a row in an in-memory overlay
  (`packages/studio/src/app/panels/ReviewPanel.tsx`). A teammate or a CI job never sees a decision.
- **Machine-translation provenance in exports and reports.** Marking machine output in XLIFF and
  TMX exports, and producing a per-locale report of machine versus human values, both need an
  origin per key.

The facts that constrain the design, verified against the current tree:

1. **Every value write funnels through four SDK functions.** `writeTargetResource` is called for a
   configured target locale only by `runLocale` (reached by `translate`, `watch`, and the
   `translatePending` surfaces in Studio and MCP), `editEntry`, `retranslateEntry`, and
   `importWorkbook` (`.xlsx`, `.csv`, `.tsv`). `pseudo` also calls it, but writes a pseudolocale
   that is never a configured locale and has no lock entries. `importTmx` writes only the
   translation memory, never a locale file; TMX content reaches a locale file later as a memory
   hit. There is no XLIFF import path: in an XLIFF project the translator edits the target file
   itself, outside every verbatra write path.
2. **Within `runLocale`, a written value has one of four sources:** a provider response (including
   content-duplicate fan-out and plural-form generation), an exact translation-memory hit, a fuzzy
   translation-memory hit, or, in human-only mode (provider `none`), an exact memory hit with no
   provider behind it. Fuzzy hits are written to the file but withheld from the lock, so they stay
   `changed` until confirmed.
3. **`editEntry` has three callers that are not all human.** The Studio edit dialog is a person.
   The MCP tool `translation.editEntry` and the Studio WebMCP tool
   `verbatra_translation_editEntry` are driven by an AI agent. Both reach the same SDK function.
4. **The lock-file version is checked for equality.** `parseLockFileRead` rejects any version other
   than `CURRENT_VERSION` (1) with `LOCK_FILE_INVALID`. Every released CLI therefore fails every
   command, `check` in CI included, on a lock file with any other version number. The
   `verbatra/action` GitHub Action pins a CLI version, so a team's CI can lag a local upgrade.
5. **`LockFile` is published API.** `loadLockFile` is exported from `@verbatra/sdk` and returns
   `LockFile`, whose `locales` field is typed `Record<string, Record<string, string>>`. Changing a
   lock entry from a string to an object is a breaking change to the fixed `sdk`/`cli` version line.
6. **The lock file's parser strips unknown top-level fields and its serializer writes only
   `version` and `locales`.** A new top-level section added without a version bump would be read
   without error by an old CLI and then silently dropped the next time that CLI wrote the file.
7. **Precedent for a forward-compatible sidecar exists.** The translation memory
   (`packages/sdk/src/cache/translation-memory.ts`) reads a file from a newer version as empty,
   refuses to overwrite it, and reports `CACHE_VERSION_UNRECOGNIZED`. The memory itself is
   gitignored and local, so a memory hit says nothing reliable about who wrote the value.

## Decision 1: storage location

Provenance lives in a new committed sibling file, `verbatra.provenance.json`, next to
`verbatra.lock.json`. The lock file, its schema, its version (1), and the `LockFile` type are not
changed.

| Concern | Inside `verbatra.lock.json` (v2) | Sibling `verbatra.provenance.json` |
| --- | --- | --- |
| Older CLI, e.g. a pinned CI action | Every command fails with `LOCK_FILE_INVALID` | Ignores the file; drift and translation keep working |
| Published `LockFile` type | Breaking change, major bump for `sdk` and `cli` | Unchanged |
| Diff noise from a review click | Rewrites the shared baseline file | Touches only the provenance file |
| Merge conflicts | Each key grows from one line to several in the file every run touches | Baseline conflicts stay as they are today; provenance conflicts are self-healing (see Decision 4) |
| Atomicity | One file, one write | Two files written in sequence under one guard |
| Adoption | Needs a migration | Absent file means "no record yet" |

Rejected alternatives:

- **Lock file version 2 with an object per key.** Fails every older CLI outright (fact 4) and
  breaks the published type (fact 5). The single-file atomicity it buys is not worth a hard
  failure in every lagging CI job.
- **A new top-level section in the lock file at version 1.** Older CLIs read it without error and
  then erase it on their next write (fact 6): silent loss of review decisions is worse than a hard
  failure.
- **`verbatra.review.json`.** Same mechanics, but the file holds origin for every key, not only
  review decisions, and the name should say so.
- **Git notes or commit trailers.** Not visible to Studio or MCP without git, lost by squash
  merges and many hosting workflows, and not attached to a key.

The cost is a second file to commit and a two-file write that is not atomic. Both are bounded by
Decision 4: a provenance record that disagrees with the file it describes is detected and
reported, never trusted.

## Decision 2: schema

```json
{
  "version": 1,
  "locales": {
    "de": {
      "cart.checkout": {"origin":"machine","provider":"anthropic","model":"claude-sonnet-4-5","valueHash":"8f3a0c1e2b4d6f70"},
      "home.title": {"origin":"human","valueHash":"19ad44b0c3e2f581","reviewState":"approved","reviewer":"mk"}
    }
  }
}
```

One record per key and target locale:

| Field | Required | Meaning |
| --- | --- | --- |
| `origin` | yes | The write path that produced the current value (Decision 3). |
| `provider` | `machine` only | The configured provider id, for example `anthropic` or `deepl`. |
| `model` | no | The model the provider config resolves to, when the provider has one. |
| `valueHash` | yes | `stableStringHash(normalizeText(value))` of the target value that was written. |
| `reviewState` | no | `approved` or `rejected`; absent means unreviewed (Decision 5). |
| `reviewer` | no | Free text, stored only when a caller supplies it (Decision 6). |
| `reviewedSourceHash` | no | The lock-file source hash an approval was given against (Decision 8). |

The record stores no text: no source value, no target value, no machine suggestion. The file stays
small and carries nothing that could be sensitive beyond key names, which the lock already holds.
Nothing from provider options other than `id` and `model` is recorded, so an `openai-compatible`
`baseUrl` or a key variable name never lands in the file.

`valueHash` reuses `@verbatra/core`'s `normalizeText` and `stableStringHash` (the same NFC and
line-ending normalization the lock's source hash uses), so re-saving a locale file with CRLF
endings does not read as an edit. It is not a security hash and does not need to be: it detects
accidental divergence, not tampering.

## Decision 3: origin values

| Origin | Written by | Class |
| --- | --- | --- |
| `machine` | A provider response in `runLocale` (including duplicate fan-out and plural-form generation) and `retranslateEntry` | machine |
| `memory` | An exact translation-memory hit in `runLocale`, including human-only mode | machine |
| `fuzzy` | A fuzzy translation-memory hit in `runLocale` | machine |
| `agent` | `editEntry` called through the MCP tool or the Studio WebMCP tool | machine |
| `human` | `editEntry` called from the Studio edit dialog, or by an SDK consumer with the default actor | human |
| `import` | An accepted row in `importWorkbook`, `[[CLEAR]]` included | human |
| `unknown` | Never written by a write path; see below | unknown |

`memory` counts as machine-class because the memory is local and records no author (fact 7): an
exact hit can be a value a person entered through `editEntry`, a TMX import, or a provider
response. Counting it as machine errs toward asking for review. A later translation-memory version
that records origin per entry would let a hit inherit the origin of what it reuses; that is
deferred (Decision 10).

`editEntry` gains an optional `actor: "human" | "agent"` input, default `human`. The MCP tool and
the Studio WebMCP tool pass `agent`; the Studio dialog passes nothing. This is an assertion by the
calling surface, not an authentication, which is the same trust level as everything else in the
file (Decision 9).

`unknown` is never produced by a write path. It exists so that an `approve` or `reject` on a key
that has no record yet (a value written before this feature, or edited outside verbatra) can be
stored without inventing an origin.

Readers derive two further origins that are never stored:

- **`unrecorded`**: the key has a value but no record. Every key in a project adopted before this
  feature starts here.
- **`external`**: a record exists but its `valueHash` does not match the current value. Something
  outside verbatra's write paths changed the value: a translator editing an XLIFF or JSON file in
  a pull request, an older CLI that does not know this file, a manual merge resolution.

Rejected alternatives:

- **A single `machine:<provider>/<model>` string.** Compact, but every reader has to parse it and
  every new attribute changes its grammar.
- **`derived` as an origin for plural-form generation.** Generation is a provider call; recording it
  as `machine` with the provider and model is more precise. A future write path that genuinely
  derives a value without a provider (a locale fallback, for example) can add an origin under the
  forward-compatibility rule in Decision 7.
- **Recording `editEntry` from MCP as `human`.** It is the case the transparency workflow most needs
  to get right: an agent-authored value presented as human work is the exact failure a provenance
  record exists to prevent.

## Decision 4: how each write path sets provenance, and the self-healing rule

Provenance is written in the same critical section as the lock, under the existing lock-file guard
(`withLockFileGuard`), after the target file and before the lock. The lock update function is
widened to take the provenance patch as a required argument, so a write path cannot update the
baseline without also stating provenance: the type system enforces the rule, and a scan test
enforces that every non-`pseudo` caller of `writeTargetResource` goes through it.

| Write path | Records written | Records removed |
| --- | --- | --- |
| `translate` / `watch` (`runLocale`) | `machine` for provider output and generated plural forms, `memory` for exact hits, `fuzzy` for fuzzy hits | Pruned keys, and keys no longer present in the target (a `rejected` record excepted) |
| `retranslateEntry` | `machine` for the key | none |
| `editEntry` | `human` or `agent` for the key | none |
| `importWorkbook` | `import` for each accepted row | Keys no longer present in the target (a `rejected` record excepted) |
| `pseudo`, `importTmx`, dry runs, estimates | nothing | nothing |

Rules shared by every path:

- **A no-op write keeps the record.** When a write leaves both the value and the lock's source hash
  for a key unchanged, its record is untouched, so an approval survives a re-import of an unchanged
  row or an edit that saves the same text. Any other write replaces the record with a fresh,
  unreviewed one.
- **Keys a run does not write keep their record byte for byte,** including records carrying fields
  or origins this build does not recognize (Decision 7).
- **A key withheld this run** (integrity mismatch, provider failure, budget, invalid ICU, unfilled
  in human-only mode) keeps its prior record, exactly as it keeps its prior lock hash.
- **A write is skipped when the serialized file is unchanged,** so a no-op run does not touch the
  file and does not wake the Studio file watcher.
- **A write checks the file before it does anything else.** `translate`, `watch`, and
  `importWorkbook` read it before any locale runs; `editEntry` reads it before the value is gated
  and `retranslateEntry` before the provider is called. A corrupt file therefore stops the write
  before a locale file changes or a provider is paid.
- **A key removed from the source keeps its record** for as long as its value stays in the target
  file, exactly as its value does: without `prune`, an orphaned key is reported and kept, and so is
  its record. A pruning run removes both, except a `rejected` record (Decision 5).
- **A locale removed from the configuration keeps its records,** as it keeps its lock entries: no
  run touches a locale it does not run, so nothing is dropped behind the user's back. Deleting that
  locale's block from the file by hand is safe.

The hash is taken over the value as the adapter reads it back, so a format whose writer escapes or
re-encodes a value must still hash to the same thing after a round trip. A round-trip test runs
every built-in adapter over a value corpus (placeholders, markup, escapes, line breaks, non-ASCII)
and fails if any written value reads back as `external`.

Because every record carries the hash of the value it describes, a record that has fallen out of
step with its file (a crash between the two writes, a run by an older CLI, a merge that took the
locale file from one side and the provenance file from the other) reads as `external` rather than
as a false attribution. A merge conflict in `verbatra.provenance.json` can therefore be resolved by
taking either side: the wrong side can only cost information, never invent it. The one exception is
the size skip in Decision 8.

## Decision 5: review state machine

Review state belongs to a value, not to a key. It is stored as `reviewState`, absent meaning
unreviewed.

| From | Event | To | Triggered by |
| --- | --- | --- | --- |
| unreviewed | approve | approved | a reviewer in Studio, an MCP client, an SDK consumer |
| unreviewed | reject | rejected | the same |
| approved | reject | rejected | the same |
| rejected | approve | approved | the same |
| any | a write that changes the value or its source hash | unreviewed (fresh record) | any write path in Decision 4 |
| any | the source text changes, no write | unchanged | nobody; staleness is derived from the lock |

- **Approve and reject are explicit actions** by Studio, MCP, or an SDK consumer. They write only
  `verbatra.provenance.json`, never a locale file or the lock. Each takes the value hash (or the
  value) the reviewer saw and fails if the current value differs, so two reviewers, or a reviewer
  and a running translate, cannot approve a value neither of them looked at.
- **A write resets.** Any write that changes the value or its source hash creates a fresh
  unreviewed record. Editing an approved value therefore drops it back to unreviewed, which is
  Tolgee's behaviour and the one the review gate needs.
- **A source change does not touch the record.** Staleness is already derivable from the lock
  (source hash differs), so it is not stored twice. "Approved, but the source has changed since" is
  a derived state that a reader computes from both files; the protection and review workflows name
  it `needs-review`.
- **`rejected` means "this value must be replaced".** The record stays on the key with the rejected
  value's hash, so a later run can refuse to reinstate the same text from the translation memory. It
  is a tombstone keyed on the value: if the key is cleared, the record is kept until a new value is
  written for that key.

`reviewed` as a state separate from `approved` is rejected: no planned workflow distinguishes the
two, and a second positive state would add a transition question with no consumer. A future need
(XLIFF 2 `reviewed` versus `final`, for example) can add it under Decision 7.

How the actions are carried out, as delivered:

- **Approve** (`approveEntry`) requires the key's current value to equal the value the reviewer saw
  and its lock entry to match the current source hash, and stores `reviewedSourceHash`. A value
  whose source changed since it was written is refused (`REVIEW_SOURCE_CHANGED`): approving it
  would need the lock updated, which approve never does, so the key is edited or retranslated
  instead.
- **Reject** (`rejectEntry`) removes the value from the locale file and its lock entry, so the key
  reads as missing and the next run, or a person, writes a new value. The `rejected` record stays
  as the tombstone above, and the exact translation-memory entry for the key's source is dropped on
  the machine that rejected it, once everything else has succeeded. The lock file is validated and
  the record planned under the lock-file guard before the locale file is touched, and the lock and
  provenance files are written under that same guard; any failure after the locale file was
  rewritten restores the locale file and the provenance file byte for byte. A format whose writer
  keeps a key it was not given cannot express a removed value: XLIFF, where a unit without a
  target reads as its source text, and Flutter ARB, whose writer keeps every existing message. The
  file is restored and the call fails with `REVIEW_REJECT_UNSUPPORTED`. Keeping the value in place and
  marking it for retranslation was rejected because it keeps shipping text a reviewer refused and
  needs every run to learn the rule; reverting to an earlier value from git was deferred, because
  this file stores no text and the earlier value may itself be unreviewed machine output.
- Both actions check the provenance file before anything is written and fail with
  `PROVENANCE_FILE_UNWRITABLE`, rather than succeed silently, when the file is from a newer
  version or the decision would grow it past the read bound.
- Neither action is offered to AI agents: the MCP server and the Studio WebMCP tools expose no
  approve or reject, because an agent approving machine output is the failure the review record
  exists to prevent.

## Decision 6: timestamps and reviewer

**No timestamps.** A timestamp would change the file on every write, including writes that change
nothing a reader cares about; it would make two otherwise identical runs produce different bytes,
break the "a no-op run writes nothing" rule, and turn every parallel branch into a conflict on the
same lines. Git already records when and by whom the file changed, and Studio already reads that
history (`packages/studio/src/server/methods/history.ts`). A provenance report that needs a date
can take it from the commit.

**`reviewer` is optional free text, stored only when a caller supplies it.** It is never derived
from `git config user.email`, the operating-system user, or an MCP client identity, because the
file is committed and shared. It is bounded (at most 64 characters, no control characters) and
documented as public. An email address is not rejected (a team may choose one), but nothing
defaults to one. Repeating the same decision on the same value without a reviewer keeps the
reviewer the earlier decision named, so a second click from a surface that sends no name does not
erase attribution; a decision that names a reviewer replaces it.

## Decision 7: versioning and compatibility

`verbatra.provenance.json` starts at `version: 1`. The version is a major version: it changes only
for a change an older reader would misinterpret. Within a version, change is additive only.

- **Unknown fields and unknown origin or review values are tolerated.** A reader shows an
  unrecognized origin as `unknown` and an unrecognized review state as unreviewed; a writer carries
  a record it does not rewrite through unchanged, unknown fields included. New origins (a future
  `derived`) and new optional fields ship without a version bump.
- **A newer version** is read as "no records" and is never overwritten, following the
  translation-memory precedent. `translate`, `watch`, and `importWorkbook` report the notice
  `PROVENANCE_VERSION_UNRECOGNIZED`; `editEntry` and `retranslateEntry`, which return no notices,
  skip the record silently, as they do when the file is too large (Decision 8). The write itself proceeds: the lock and the locale files are still
  written, and the values it writes will read as `external` to the newer CLI, which is honest.
- **A corrupt file** (not JSON, wrong shape, oversized) fails every write with a new error code
  `PROVENANCE_FILE_INVALID`, like the lock, because silently treating it as empty and then writing
  would erase every review decision in the project. `loadProvenance`, which returns the raw file,
  throws it too.
- **Reports never fail over the provenance file.** `check`, `diff`, `lockState`, `keyValue`, and
  `localeValues` leave their provenance fields out when the file is corrupt or from a newer version,
  so a CI gate on drift keeps working while the file is being repaired or the CLI upgraded.
- **A missing file** is not an error: every key reads as `unrecorded`, and the first write creates
  the file.
- **The lock file needs no migration.** It is unchanged, so an old lock file is read exactly as
  before. An older CLI ignores `verbatra.provenance.json` entirely and keeps working.
- **Keys named `__proto__` or `constructor`** are handled with null-prototype records, matching the
  lock file's existing fix.

## Decision 8: serialization

Locales sorted, keys sorted (in JavaScript object order, as the lock file is: integer-like keys such
as `"10"` first in ascending numeric order, then every other key in code-unit order), one record per line, fields in the fixed order `origin`, `provider`,
`model`, `valueHash`, `reviewState`, `reviewer`, `reviewedSourceHash`, absent fields omitted, a trailing newline. One
line per record keeps the file's diffs and conflicts line-shaped like the lock's: two branches that
touch different keys do not conflict unless the keys are adjacent.

The read bound is 32 MiB. A lock entry is a key plus a 16-character hash, about 40 bytes per key
and locale; a provenance record carries the same key, an origin, a 16-character value hash, and for
machine output a provider and model name, about 110 to 150 bytes. The lock's 16 MiB bound therefore
holds roughly 400,000 key-locale pairs and this one roughly 220,000 to 300,000, so a project near
the lock's limit can outgrow this file first. Because a file verbatra cannot read back would fail
every later write, a writer never produces one: when the serialized file would exceed the bound, it
keeps the previous file untouched and the run reports the notice `PROVENANCE_FILE_TOO_LARGE` for
that locale. `editEntry` and `retranslateEntry`, which return no notices, skip the record silently,
as they do for a newer file. The lock and the locale files are still written, so the run does not
repeat paid work on the next attempt; holding the lock back instead would retranslate the same keys
on every run.

This is the one case where a record can outlive the value it was written for. A value that changed
reads as `external` or `unrecorded`, which only loses information. But a key whose new value happens
to equal the old one, or whose source changed while its value stayed the same, keeps its old record,
review decision included, although a different write path produced it or the source it was reviewed
against has changed. Two rules contain that: the approve and reject actions (Decision 5) must not
report success for a decision they could not persist, and the review workflow must treat an
approval as reset, not approved, for a key whose lock source hash changed since the approval was
recorded while the file was over the bound, which means an approval records the source hash it was
given against, an additive field under Decision 7. The size skip is otherwise a loss of information, never
a false attribution.

## Decision 9: what the record is, and is not

The record states which verbatra write path produced a value. It is not tamper-evident: anyone who
can edit the locale files can edit this one, and a caller of `editEntry` asserts its own actor.
Documentation and every report built on it say so, and the provenance report planned for
transparency obligations is presented as supporting evidence, not as legal advice or an
attestation.

## Decision 10: how it is exposed

All additions are optional fields on existing results, so no JSON envelope version and no MCP
output contract changes incompatibly.

- **SDK:** `loadProvenance` (the raw file, mirroring `loadLockFile`), `PROVENANCE_FILE_NAME`, the
  record and origin types, and an effective per-key view `{ origin, provider?, model?,
  reviewState, reviewer? }` where `origin` includes the derived `unrecorded` and `external`.
  `LockLocaleState` and `LocaleCheckSummary` gain per-locale counts by origin and review state. `KeyValueResult` and `KeyValuePair` (from `localeValues`) gain the effective view.
  `LocaleDiff` gains the effective origin for each `changed` key, which is what protection needs to
  show before a run.
- **CLI:** `check --json` and `diff --json` carry the new fields. The human-readable output of
  `check` and `diff` is unchanged in this increment; gates and new lines belong to the workflows
  that act on them.
- **MCP:** `lock.state` gains the counts and `key.value` gains the effective view. `status.check`
  and `status.diff` pass the SDK fields through. `translation.editEntry` writes with the actor
  `agent`.
- **Studio:** a per-key origin badge in the translations table (from `localeValues`), the full
  record in the key drawer, and the counts on the lock card. The file watcher also watches
  `verbatra.provenance.json`. The `translation.editEntry` RPC method takes an optional `actor`: the
  edit dialog leaves it out (recorded as `human`), and the WebMCP tool always sends `agent` without
  exposing the parameter to the agent.
- **Output guards:** `verbatra.provenance.json` joins the reserved outputs
  (`packages/sdk/src/flow/reserved-output.ts`), so `tmx export` and `types` cannot overwrite it.
- **Unreadable file:** every report field above is optional and left out when the file is corrupt
  or from a newer version (Decision 7).

## Decision 11: what the dependent workflows get from this

- **Protecting human translations.** The effective origin per key is available inside `runLocale`
  before any provider call. A `changed` key whose origin is `human`, `import`, or `external` can be
  partitioned out as `needs-review` instead of being sent to the provider, with its value and its
  lock hash left alone so it stays stale and visible. That workflow protects `human`, `import`, and
  `external` by default, and leaves `unrecorded` translatable, or every project adopted before this
  feature would freeze on its first source change. A stored machine suggestion is deliberately not part of this file (it holds no
  text); that workflow chooses its own home for one.
- **Persisted review.** `reviewState`, `reviewer`, and the `rejected` tombstone are committed and
  shared, so a teammate's `check` sees the same decisions. The review queue becomes "every key whose
  origin is machine-class and whose state is unreviewed", computed from committed files instead of
  the last run. The reset-on-write rule is built in. The `rejected` tombstone gives a run what it
  needs to skip a memory hit that would reinstate the rejected text. Reverting to the last approved
  value is not possible from this file, since it stores no text; that workflow either clears the
  key or takes the value from git history.
- **Machine-translation markers in exports and reports.** Per key: origin, provider, model, and
  review state, which map directly onto an XLIFF `state-qualifier="mt-suggestion"` for unreviewed
  machine-class values and a TMX `<prop type="x-origin">`, and onto per-locale counts of
  machine-unreviewed, machine-approved, human, and imported values.

## Implementation status

Delivered with this record:

- The provenance file, its reader, writer, versioning, size guard, and serialization (Decisions 1,
  2, 7, 8).
- Every write path listed in Decision 4 records its origin, enforced by the required argument and
  the scan test; the per-adapter round-trip test.
- The optional report fields in the SDK, `check --json`, `diff --json`, and MCP `lock.state` and
  `key.value`; `loadProvenance`; the output guards.
- The `actor` on `editEntry`, passed as `agent` by the MCP tool and the Studio WebMCP tool.

Delivered next:

- Approve and reject as actions: the SDK functions `approveEntry` and `rejectEntry` with the
  stale-value check, the 64-character `reviewer` limit, and `reviewedSourceHash`; Studio's Approve
  and Reject buttons; and a review queue (`reviewQueue`, Studio, MCP `review.queue`) that leaves
  out every flag decided since the run (Decisions 5, 6 and 8).

Specified here, delivered later:

- The `rejected` handling in a run: skipping an exact or fuzzy memory hit whose value hash equals a
  `rejected` record's hash, so a teammate's memory cannot reinstate the text (Decision 5).
- A review queue built from committed state alone (every machine-class, unreviewed value), bulk
  approval, and a CI gate on unreviewed machine values.
- The Studio origin badge, the key-drawer record, the lock-card counts, and watching
  `verbatra.provenance.json` for live refresh (Decision 10).
- Protecting human values and machine-translation markers in exports (Decision 11).

## Deferred

- **Origin in the translation memory.** A memory-format version that stores origin per entry would
  let an exact hit inherit `import` or `human` instead of recording `memory`. It changes the
  memory's format and fingerprinting and is its own change.
- **Reading XLIFF `state` attributes into origin.** An XLIFF target edited in a CAT tool reads as
  `external` here; mapping the file's own state attributes onto origin is adapter work.
- **A command to claim existing values** (mark `unrecorded` keys as human, for example, when
  adopting a project whose translations were written by people). Useful, but a bulk rewrite of
  attribution deserves its own review of the user experience.
- **Recording the MCP client's name for `agent` writes.** Possible from the MCP handshake, but it is
  identifying information in a committed file and should be opt-in.
