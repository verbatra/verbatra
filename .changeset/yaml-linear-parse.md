---
"@verbatra/sdk": patch
---

Read large yaml locale files in linear time: the duplicate key check no longer takes quadratic time, and a file with a duplicate key can now report a different line and column than before when it also has another syntax error, or, rarely, when the duplicate follows an empty anchored value; the error code is unchanged.
