---
"@verbatra/mcp": patch
"@verbatra/sdk": patch
---

Say when the last recorded run did not finish cleanly.

- **Agent tools:** `usage.summary` now returns an optional `incomplete` field with the number of locales that failed (`failed`) or stopped partway (`partial`), so a low or absent usage figure is no longer read as a successful run. The field is left out when every locale succeeded.
- **SDK:** `runStatus` returns the same optional `incomplete` field next to the recorded run when at least one locale failed or finished partially.
