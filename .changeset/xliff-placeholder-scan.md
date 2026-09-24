---
"@verbatra/sdk": patch
---

Find XLIFF placeholders in linear time, and ignore block comments quoted inside Apple `.strings` line comments.

Previously the XLIFF placeholder pattern rescanned to the end of the value from every unclosed
inline tag, so a long value such as `<x<x<x...` took quadratic time. An Apple `.strings` block
comment written inside a `//` line comment could also become an entry's description.

Now XLIFF placeholders are found by a single forward scan, and only a real `/* ... */` block
comment before an entry becomes its description. Where an unclosed tag runs into the next one, the
scan starts over at the inner tag, so `<x <x/>` now yields `<x/>` rather than `<x <x/>`.
