---
"@verbatra/sdk": patch
---

Take the next-best fuzzy memory hit when the best one carries a rejected text.

Previously, when the best fuzzy candidate for a key held the text a reviewer rejected, the run sent
the key to the provider without looking at the other candidates.

Now the fuzzy lookup passes over every candidate carrying the rejected text and reuses the best
remaining one above the threshold.
