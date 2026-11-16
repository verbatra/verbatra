# verbatra

verbatra keeps an app's locale files in step with its source locale: it finds what is missing or stale, fills it through a translation provider or a person, and refuses any value that would break the app.

## Language

### Locale state

**Missing**:
A source key with non-empty text that a target locale does not have.
_Avoid_: untranslated, to add

**Stale**:
A key whose source entry (its text, description, meaning, plural flag and placeholders) has changed since the translation the lock file records for it. A key with no recorded baseline is never stale.
_Avoid_: changed, outdated, to re-translate

**Up to date**:
A source key with non-empty text that the target locale has and that is not stale.
_Avoid_: unchanged, current

**Orphaned**:
A key a target locale still has but the source no longer does.
_Avoid_: extra, unused (an unused key is one the source code no longer references)

**In sync**:
A target locale with nothing missing and nothing stale; the verdict `check` reports.
_Avoid_: complete, done, up to date (for a whole locale)

**Lock file**:
`verbatra.lock.json`, the committed baseline that records, per target locale, a hash of the source entry behind each current translation. Stale is judged against it.
_Avoid_: lock-file, lockfile, lock (alone); the write lock a run holds while writing is a different thing

**Provenance**:
The committed record of which write path produced each target value (its origin) and of any review decision on it.
_Avoid_: history, audit log

**Machine-class value**:
A target value written by a path that does not prove a person wrote it: a provider's answer, a translation cache hit (exact or fuzzy), or an AI agent's edit. These are the values a person is asked to review.
_Avoid_: machine translation (only one of these origins), AI value

**Protected key**:
A stale key a run deliberately leaves alone because a person wrote, imported or hand-edited its value, or because the config pins it. It stays stale until a person resolves it.
_Avoid_: locked key, skipped key

### Writing values

**Candidate**:
Any value about to be written to a locale file, whatever produced it: a provider's answer, a translation cache hit, a generated plural form, a pseudolocalized value, an imported row or a person's edit.
_Avoid_: provider answer (one kind of candidate only), suggestion (a suggestion is shown, never written)

**Integrity gate**:
The structural check every candidate must pass before it is written: the same placeholders and inline markup as the source, valid ICU (with the target language's plural arms, where the target locale is known and the format can compare them), not empty and not degenerate. It proves structure, never meaning.
_Avoid_: gate (alone), validation, QA

**Refused**:
The integrity gate's verdict on a candidate that fails it. A refused candidate is never written, and the previous value stays.
_Avoid_: rejected (reserved for review decisions), integrity mismatch, integrity-withheld (the CLI's count label, not a prose word)

**Withheld**:
A key a run left unwritten this time, keeping its previous value and lock file hash so a later run tries it again; for example because its candidate was refused, the provider failed, or the token budget ran out.
_Avoid_: dropped, failed (a locale fails, a key is withheld)

**Translation cache**:
`verbatra.cache.json`, the content-keyed store of earlier translations that lets the same source text be reused without a provider call, exactly or, when enabled, fuzzily.
_Avoid_: translation memory, TM (`memory` remains the literal provenance origin of a cache hit)

### Review

**Review flag**:
An advisory mark, with one or more review reasons, on a value that was written but looks suspicious. A flag never withholds a key.
_Avoid_: needs review, warning

**Review queue**:
The machine-class values in a locale that no person has approved for the source text the lock file records; a value in it is unreviewed. A reviewer approves a value, or rejects it, which removes it and leaves the key missing; XLIFF and Flutter ARB cannot drop a single value, so there a reviewer edits or retranslates it instead.
_Avoid_: needs-review queue, needs review, pending

**Review gate**:
`check --require-reviewed`: passes only when the review queue is empty in every checked locale.
_Avoid_: gate (alone), integrity gate

### Operating a project

**Surface**:
A way to operate a verbatra project that is built on the SDK, such as the CLI, Studio or the MCP server. Surfaces stay thin over the SDK, so every surface reports the same state. The landing page's four-pane section shows the SDK beside the three surfaces because all four read the same lock file.
_Avoid_: interface, client, frontend; the SDK itself is the engine, not a surface

**Spend tool**:
A Studio action or MCP tool that calls a translation provider and so can cost money. It is offered only when spending is explicitly allowed.
_Avoid_: spend-gated tool, paid tool
