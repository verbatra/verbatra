---
"@verbatra/mcp": minor
---

Report ICU plural, ordinal, and select arms that do not fit the target language in `key.integrity`.

Previously `key.integrity` said a value with the wrong plural arms for its language was fine, while
`translation.editEntry` refused the same value. Each entry now carries `icuArmsMatch` and
`icuArmDetails`, naming every missing or extra arm, judged exactly as the integrity gate judges it.
