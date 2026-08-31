---
"@verbatra/studio": patch
---

Internal refactor: Studio's secret-redaction pass now imports `redact` from
`@verbatra/sdk` instead of maintaining its own copy, so the guarantee that a
provider API key value never reaches a browser tab is enforced by one shared
implementation. Behavior is unchanged.
