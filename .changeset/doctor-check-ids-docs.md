---
"@verbatra/sdk": patch
---

Name every `doctor` check in the published type documentation.

`DoctorResult.checks` listed the setup checks without `network-policy`, and
`DoctorInput.literals` named only four of the setup checks a literal run skips. Both now list
every check id `doctor` reports.
