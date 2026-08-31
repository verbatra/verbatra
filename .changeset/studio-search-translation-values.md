---
"@verbatra/studio": minor
---

Studio's Translations and Review search boxes now also match translation content, not just key
names. A query matches a key's name, its current source text, or its current target text for the
locale being searched, case-insensitively, with no other behavior change: the 500-key render cap,
its ordering, and the empty-query fallback all stay as they were. Both search inputs now read
"Filter by key or translation text" so the widened behavior is discoverable.
