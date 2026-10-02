---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Progress and `next:` hints, `--quiet` and `--no-color`, session banners, finer `onProgress`.

**Progress and hints**
- Every command shows what it is doing on stderr, as a spinner on a terminal and plain lines in
  CI. `translate` and `watch` show each locale, batch, retry and write.
- Commands end with a `next:` hint that runs as printed. stdout and `--json` are unchanged.
- `-q`/`--quiet` keeps only results, warnings and errors. `--no-color`, `NO_COLOR`, `FORCE_COLOR`
  and `VERBATRA_NO_SPINNER` are honored.

**Sessions**
- `watch` says when it waits and when it stops. `verbatra mcp` prints ready and stopped lines and
  exits 0 when the client closes stdin.
- `verbatra mcp --redact-values` (or `VERBATRA_MCP_REDACT_VALUES`) keeps translation values out of
  every MCP tool result and says so in the ready line.
- `studio` reports whether spend and agent tools are on, `--verbose` logs requests, and a server
  error is shown as a warning.

**Output fixes**
- Errors go to stderr, paths print relative to the working directory, dry runs read
  `would translate`, `--estimate` is headed `(estimate)`, `watch --help` has examples,
  `types --check` says a missing declaration is missing, and counts of one read in the singular.

**SDK**
- `onProgress` gains retry, repair, write and `watch` events, and `extract`, `diff` and `doctor`
  report `files-scanned`. `watch` takes an `onReady` callback, and
  `GenerateTypesResult` carries `missing`.
