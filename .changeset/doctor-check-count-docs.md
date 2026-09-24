---
"@verbatra/sdk": patch
---

Describe the `doctor` checks by name and count them as `DoctorResult.checks` lists them.

Previously the `doctor` reference said five checks run and numbered the rest from the sixth to the
eighth, leaving `network-policy` unnumbered, while a setup run reports nine.

Now the reference says nine checks run, six of which can fail, and names the three informational
ones instead of numbering them.
