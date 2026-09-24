---
"@verbatra/sdk": patch
---

Make the budget and blank-row notices agree with their counts.

A budget notice with a one-token ceiling or projection read `1 tokens`, and an import notice for a
single drifted blank row read `1 row(s) were left blank`. They now read `1 token` and
`1 row was left blank`, with the plural kept for every other count.
