---
"@verbatra/cli": minor
---

Export the error codes the CLI raises itself as `CLI_ERROR_CODES` and `CliErrorCode` from
`@verbatra/cli`.

Previously the codes a script could meet in the `verbatra: error [CODE]` line or the `ok: false`
JSON envelope, such as `USAGE_ERROR` or `INVALID_LOCK_TIMEOUT`, were listed only in the
documentation.

Now one readonly list is the source of truth. Every place the CLI raises a code is typed against
it, a test fails when the source raises a code the list lacks or the list names one nothing
raises, and the CI and exit codes guide lists every code in the same order.
