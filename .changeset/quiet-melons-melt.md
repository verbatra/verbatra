---
"@verbatra/mcp": patch
---

Accept the new `MAX_LENGTH_EXCEEDED` review reason in the retranslate tool's result schema, so a
key flagged for overrunning its configured length budget is reported rather than rejected as an
unrecognized code.
