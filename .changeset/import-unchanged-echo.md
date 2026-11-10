---
"@verbatra/sdk": patch
---

Re-importing a filled workbook row no longer rewrites a value that is already up to date.

- **Unchanged echo:** a CSV, TSV or xlsx row equal to the current up-to-date value is reported unchanged, so the value keeps its origin and its review decision instead of being reset to `import`.
