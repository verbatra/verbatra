---
"@verbatra/sdk": patch
---

Fix workbook import silently accepting a sheet whose middle header columns (Source, Current translation, Status, Translation) were reordered or relabeled, previously validated only by Key and Source hash while data was still mapped by column index. The header check now validates all six columns present in every workbook this package has ever emitted, rejecting a mismatched header with a structural error; columns 7 through 9 stay unchecked for backward compatibility with legacy workbooks.
