---
"@verbatra/sdk": patch
---

Report each imported key in exactly one bucket of the import summary.

Previously a key that was already up to date before the import, and that a handoff row then
overwrote, cleared with `[[CLEAR]]`, or had refused, was listed under `unchanged` as well as under
`translated` or `integrityMismatches`.

Now `unchanged` leaves out every key the handoff accepted or refused, so a cleared key appears only
under `translated`.
