---
"@verbatra/cli": patch
---

Print the error behind an interrupted Studio batch in the terminal running `verbatra studio`.

Previously the CLI dropped every line Studio's server wrote except the request log under
`--verbose`, so the dashboard's "check the terminal running Studio" pointed at nothing.

Now a `studio error: ...` line from the server is shown on stderr as a `verbatra:` warning, with
the session token masked, with or without `--verbose` and under `--quiet`.
