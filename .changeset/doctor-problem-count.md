---
"@verbatra/cli": patch
---

Match the pronoun to the count in the `verbatra doctor` summary line.

Previously a single failed check read `1 problem found (run verbatra doctor again after fixing
them)`.

Now it reads `1 problem found (run verbatra doctor again after fixing it)`, and two or more keep
`fixing them`. JSON output is unchanged.
