---
"@verbatra/mcp": patch
---

Accept the new `MAX_LENGTH_EXCEEDED` and `FUZZY_CACHE_REUSE` review reasons in the retranslate
tool's result schema, so a key flagged for overrunning its configured length budget or reused from
an earlier source text is reported rather than rejected as an unrecognized code.
