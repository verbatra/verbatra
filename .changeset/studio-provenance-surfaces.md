---
"@verbatra/studio": minor
---

Show who wrote each translation in the dashboard.

Previously Studio had no view of `verbatra.provenance.json`. Each changed key in the translations
panel now carries an origin badge (machine, memory, fuzzy match, agent, human, import, unrecorded,
or edited outside verbatra), the key drawer shows each locale's full record (origin, provider,
model, review state), and the lock file details count each locale's values by origin. The
dashboard refreshes live when the provenance file changes, and the WebMCP tool descriptions say
which provenance fields each read tool returns.
