---
"@verbatra/sdk": patch
---

Tighten glossary adherence review flagging.

`GLOSSARY_TERM_MISSED` now matches glossary terms on whole-word boundaries on both the source and
the translated side, so a term such as `AI` is no longer counted as present inside `Airport`.
Terms carrying punctuation (`C++`, `.NET`) match literally, and a term whose edge falls in a script
written without word separators (Han, kana, Thai and similar) keeps plain containment matching,
because those scripts offer no boundary to anchor to.

Review flags are also computed for values served from the translation-memory cache. Until now a
cached reuse carried no review flags at all, so a glossary violation, a length-ratio outlier or a
value identical to its source could be written without ever reaching `needsReview`. A cached reuse now runs through the same review heuristics as a freshly
translated value. Flagging stays advisory: a
flagged value is still written to the locale file and still recorded in the lock file.
