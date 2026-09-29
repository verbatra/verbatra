---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Load the spreadsheet libraries only when a workbook is built or read, so every command that does
not export or import an `xlsx` handoff starts faster.
