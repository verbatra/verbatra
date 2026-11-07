---
"@verbatra/sdk": patch
---

Read large yaml locale files in linear time: the duplicate key check no longer takes quadratic time, and a file that has a duplicate key and another syntax error can now report the line and column of the other error.
