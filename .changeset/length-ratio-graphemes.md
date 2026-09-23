---
"@verbatra/sdk": patch
---

Stop the `LENGTH_RATIO_OUTLIER` review flag from firing on correct Chinese, Japanese, and Korean translations.

The length ratio was measured in UTF-16 code units against fixed bounds, so compact CJK output was
routinely flagged and an emoji or other astral character counted twice.

Both values are now counted in grapheme clusters and scaled by the typical character density of
their locale's script, so a correct translation between scripts is no longer flagged while a
truncated or runaway one still is.
