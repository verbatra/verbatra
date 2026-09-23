---
"@verbatra/sdk": patch
---

Stop the `LENGTH_RATIO_OUTLIER` review flag from firing on correct Chinese, Japanese, and Korean translations.

The length ratio was measured in UTF-16 code units against fixed bounds, so compact CJK output was
routinely flagged and an emoji or other astral character counted twice.

Both values are now counted in grapheme clusters, each weighted by its own script into a
Latin-equivalent length (Han 3.5, Hiragana and Katakana 1.5, Hangul 2, anything else 1). A correct
translation between scripts, including one mixed with placeholders or URLs, is no longer flagged,
while a truncated or runaway one still is. Text in scripts that combine marks into one cluster, such
as Devanagari or Thai, now counts shorter than before, since a base letter with its marks counts
once.
