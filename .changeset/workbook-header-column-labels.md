---
"@verbatra/sdk": patch
---

Fix workbook import silently accepting a sheet whose middle header columns
(Source, Current translation, Status, Translation) were reordered or
relabeled, since only Key and Source hash were validated while data was mapped
by column index. The header check now validates all six columns, rejecting a
mismatched header with a structural error.
