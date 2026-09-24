---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Report ICU plural arms that do not fit the target language in every read-only report.

Previously the integrity gate refused such arms on every write, but `keyIntegrity` and the export
review columns still judged only placeholders and ICU syntax, so an existing value with the wrong
arms looked fine while every edit of it was refused. Imports reported the `icu` reason without
saying which arms were wrong.

Now `keyIntegrity` entries carry `icuArmsMatch` and `icuArmDetails`, and an exported row whose
current translation has the wrong arms is flagged `icu-arms` with each one named, using the same
check as the gate. `importWorkbook` fills `integrityRefusals` for the rows the gate refused, and each
`importTmx` locale lists its refused units under `refusals` with the unit ordinal and details.
`verbatra import` and `verbatra tmx import` print those details.
