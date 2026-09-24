---
"@verbatra/sdk": patch
---

Read XML child elements through one shared helper in the XLIFF and `.stringsdict` adapters.

Previously each of the two adapters kept its own copy of the helper the other XML adapters share.

Now they use the shared one, with unchanged results.
