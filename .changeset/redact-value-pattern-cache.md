---
"@verbatra/sdk": patch
---

Build the pattern that scrubs configured key values once per set of values.

Previously `redact` rebuilt that pattern on every call, so redacting many strings in a row rebuilt
it each time. Now it is rebuilt only when a key variable changes.
