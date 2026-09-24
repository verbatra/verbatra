---
"@verbatra/studio": minor
---

Show a Plural arms mismatch integrity state in the key detail view.

Previously the integrity indicator read clean for a translation whose plural arms do not fit the
target language, although saving that same value was refused. It now shows **Plural arms
mismatch** and names each wrong arm, and the `verbatra_key_integrity` agent tool returns
`icuArmsMatch` and `icuArmDetails`.
