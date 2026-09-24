---
"@verbatra/studio": patch
---

Label the arms integrity state ICU arms mismatch.

Previously the state read Plural arms mismatch, although it also covers `select` arms, `=N` arms,
and a plural offset. It now reads **ICU arms mismatch**.
