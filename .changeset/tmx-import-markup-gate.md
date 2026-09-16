---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Hold an imported TMX unit to the inline markup check

`importTmx` now counts a unit refused for inline markup under `rejected.markup`, and
`verbatra tmx import` prints a line for those refusals, so a translation memory from another tool
cannot slip a tag its source never had (such as an injected `<img onerror>`) into the memory.
