---
"@verbatra/sdk": patch
---

Read large yaml locale files in linear time: the duplicate key check no longer takes quadratic time, and its error now points at the duplicate key itself (`a:` then `a: 1` was line 1 column 3, now line 2 column 1). The error code is unchanged.
