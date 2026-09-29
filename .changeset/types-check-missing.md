---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Say that the declaration is missing when `verbatra types --check` finds no file.

Previously `types --check` reported a declaration that was never generated as "out of date". It now
says `is missing, run verbatra types to create it`, and `GenerateTypesResult` carries a `missing`
flag, set when no file existed at `path` when the run started.
