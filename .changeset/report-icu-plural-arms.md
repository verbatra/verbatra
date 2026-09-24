---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Report ICU plural arms that do not fit the target language in every read-only report and import.

Previously `keyIntegrity` and the export review columns never compared ICU plural arms, so an
existing value with the wrong arms looked fine, and an import reported a refused value without
saying what was wrong.

Now `keyIntegrity` entries carry `icuArmsMatch` and `icuArmDetails`, and an exported row whose
current translation has the wrong arms is flagged `icu-arms` with each one named, using the same
check as the integrity gate. `importWorkbook` fills `integrityRefusals` for the rows the gate
refused, and each `importTmx` locale lists its refused units under `refusals`, each with its
ordinal among every `tu` in the file's first `body` (as import errors count them) and the details
the check names. `verbatra import` prints the details of each refused row, and `verbatra tmx
import` lists every refused unit as `unit N: reason`, followed by its details when the check names
them.
