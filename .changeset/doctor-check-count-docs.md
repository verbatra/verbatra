---
"@verbatra/sdk": patch
---

Describe every `doctor` check by name in the reference and the published type documentation.

The `doctor` reference now says nine checks run, six of which can fail, and names the three
informational ones. `DoctorResult.checks` and `DoctorInput.literals` list every check id `doctor`
reports, including the checks a literal run skips.
