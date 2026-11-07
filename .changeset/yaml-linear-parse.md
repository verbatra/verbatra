---
"@verbatra/sdk": patch
---

Read large yaml locale files in linear time: the duplicate key check no longer takes quadratic time, and the error for a duplicate key now points at the duplicate key itself, where it used to point at the end of an empty value just before it (`a:` then `a: 1` was line 1 column 3, now line 2 column 1); a file that also has another syntax error can report that error instead. The error code is unchanged, and at most 20 warnings about a yaml file are printed.
