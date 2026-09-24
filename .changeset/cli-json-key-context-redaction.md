---
"@verbatra/cli": patch
---

Redact a key named by its JSON member in `--json` output.

Previously each JSON string was scrubbed on its own, so a DeepL key whose context was the object
key, such as `{"auth_key":"<uuid>"}`, reached stdout unredacted.

Now the re-serialized document is scrubbed once more as a whole, and the output stays valid JSON.
