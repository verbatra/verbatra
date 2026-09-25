---
"@verbatra/cli": minor
---

Name the code of a wrapped error in the CLI's error output.

Previously a provider whose key was missing failed with `PROVIDER_CONSTRUCTION_FAILED` alone, so a
script could not tell a missing key from any other construction failure without parsing the
message.

Now, when an error wraps another error that has a code, the stderr line ends with
`(cause: MISSING_API_KEY)` and the `--json` error record carries `causeCode`. The envelope
`version` stays `1`, since the field is new and optional.
