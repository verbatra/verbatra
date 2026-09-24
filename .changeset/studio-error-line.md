---
"@verbatra/cli": patch
"@verbatra/studio": patch
---

Print the cause of an unexpected Studio server error in the terminal running Studio.

Previously an RPC call that failed with an unexpected error answered `INTERNAL`, which the
dashboard shows as "Check the terminal running Studio for details.", but the server wrote only its
request line there, and `verbatra studio` dropped every line the server wrote.

Now the server writes one `studio error: <method> failed: <message>` line to its output for such
an error, redacted and with every control character replaced by a space, and the CLI shows every
`studio error: ` line on stderr as a `verbatra:` warning, with the session token masked, with or
without `--verbose` and under `--quiet`.
