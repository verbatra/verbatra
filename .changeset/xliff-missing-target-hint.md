---
"@verbatra/sdk": patch
---

Name the next step when an XLIFF target file does not exist.

Previously a write to a missing XLIFF target failed with `INVALID_STRUCTURE` and only "The
destination XLIFF file does not exist.", without saying that verbatra never creates one.

Now the message says verbatra updates the targets of a pre-seeded file, and to copy the source
XLIFF file to the locale's path, set its target language, and run the command again.
