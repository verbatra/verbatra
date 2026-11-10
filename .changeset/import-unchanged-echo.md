---
"@verbatra/sdk": patch
---

Re-importing a filled workbook row that equals the current up-to-date value is now reported unchanged instead of translated.

- **Unchanged echo:** a CSV, TSV or xlsx row equal to the value an up-to-date key already holds is no longer written again, and no longer counts as a translated key, so an import of a file you already imported reports what actually changed.
