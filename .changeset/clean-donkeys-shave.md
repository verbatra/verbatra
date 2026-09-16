---
"@verbatra/sdk": patch
---

Tighten glossary adherence review flagging.

`GLOSSARY_TERM_MISSED` now requires a whole-word occurrence of a glossary term on the source side,
so a term such as `AI` is no longer read as present inside `Airport` and no longer raises an
expectation the translation was never given. The target side keeps containment matching, because a
translated term legitimately fuses with the text around it: German compounds, Korean particles and
Japanese loanwords all carry the term with no boundary around it, and requiring one there would
flag correct translations. Terms carrying punctuation (`C++`, `.NET`) are matched literally. A
source term written in a script without word separators (Han, kana, Thai and similar) has no
boundary to anchor to and falls back to containment as well.

Review flags are also computed for values served from the translation-memory cache. Until now a
cached reuse carried no review flags at all, so a glossary violation, a length-ratio outlier or a
value identical to its source could be written without ever reaching `needsReview`. A cached reuse
now runs through the same review heuristics as a freshly translated value, reusing the placeholder
comparison the integrity gate already computed rather than repeating it. Flagging stays advisory: a
flagged value is still written to the locale file and still recorded in the lock file.
