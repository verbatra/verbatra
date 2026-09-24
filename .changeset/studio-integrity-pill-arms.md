---
"@verbatra/studio": minor
---

Show an ICU arms mismatch integrity state in the key detail view.

Previously the integrity indicator read clean for a translation whose plural, selectordinal, or
select arms do not fit the target language. It now shows **ICU arms mismatch** and names each wrong
arm, judged exactly as the integrity gate judges a save, and the `verbatra_key_integrity` agent
tool returns `icuArmsMatch` and `icuArmDetails`.
