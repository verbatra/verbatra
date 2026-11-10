---
"@verbatra/sdk": patch
---

Re-importing a filled workbook row that equals the current up-to-date value is now reported unchanged instead of translated.

- **Unchanged echo:** a CSV, TSV or xlsx row equal to the value an up-to-date key already holds, and that passes the integrity gate, is left alone: the key's value is left as it was, the key is reported unchanged rather than translated, and its provenance origin stays as it was.
- **Still gated:** in a CSV, TSV or xlsx file, an echo that fails the gate (for example a missing placeholder) is still refused and reported as an integrity mismatch, as before.
- **Translation memory:** an echoed value no longer adds its source and translation to the translation memory.
