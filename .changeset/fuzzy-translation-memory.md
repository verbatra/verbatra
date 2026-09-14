---
"@verbatra/sdk": minor
---

Add opt-in fuzzy reuse of the translation memory. With `fuzzyCache: { enabled: true }` in the config, a source string that changed only slightly reuses the translation of its earlier form instead of being sent to the provider, as long as the two are at least `fuzzyCache.threshold` alike (a similarity ratio from `0.5` to `1`, default `0.9`). The feature is off by default, so no existing run changes behavior.

A fuzzy reuse is never presented as an exact one. It lands in a new `LocaleSummary.fuzzyHits` bucket carrying the key, the score, and the earlier source text the translation was actually produced for; the CLI prints it as its own `fuzzy-reused` count with those details underneath. It passes the same integrity gate every other candidate value passes, so a reuse whose placeholders no longer fit the edited source is refused and the key goes to the provider. It is also never written back into the cache, so a reused value can never be laundered into an exact hit on a later run. `--no-cache` bypasses it along with the rest of the cache.

Scoring needs the source text, which the cache did not store, so `verbatra.cache.json` moves to schema version 2 and gains a `sources` block mapping each content hash to the text it stands for. The file grows by roughly the size of the source corpus. A version 1 cache is carried forward rather than rejected: its translations keep working as exact hits and their source text refills as later runs touch them. Going the other way, a version 1 build reading a version 2 file takes the existing unrecognized-version path, reporting `CACHE_VERSION_UNRECOGNIZED` and leaving the file untouched, so a downgrade costs a cold cache and never a wrong translation.
