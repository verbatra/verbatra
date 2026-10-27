---
"@verbatra/mcp": minor
---

Config-less start, review, glossary and read tools, values-redacted mode, progress and cancellation.

**Upgrading from 0.2**
- Node.js `^22.18.0 || >=24` is required (0.2 accepted `>=22.14.0`); Node 23 is not supported.
- `glossary.get` returns `version`, `terms` and `doNotTranslate` instead of `entries`, and `translation: null` in `glossary.write` clears only the shared translation.
- `review.queue` lists every unapproved machine-written value from the committed files. `available: false` means the provenance file cannot be read, locales lose `status` and `usage`, and the run's time is `lastRunAt`.
- Unknown `verbatra-mcp` flags exit 2, and `--help` and `--version` no longer start the server.
- Tools resolve paths against the directory of the config the search found, so a server started in a subdirectory works on the project's files.
- A failed tool's text leads with its error code, `key.integrity` fails with `UNKNOWN_KEY` for an unknown key, and write tools wait 30 seconds for a lock instead of ten minutes.
- Values written by `translation.editEntry` are recorded as `agent`.

**Server**
- The server starts without a config (`project.snapshot` reports the problem, `project.doctor` runs the setup checks) and reloads config changes with `notifications/tools/list_changed`.
- It prints ready and stopped lines on stderr, stops when the client closes stdin, and releases its locks on an interrupt. Every tool returns `structuredContent`.

**Tools**
- `review.approve` and `review.reject` record a person's decision (a `reviewer` is required) and write local files only.
- `glossary.get` and `glossary.write` read and edit glossary v2 terms.
- New read tools: `history.list`, `locale.values` and `report.provenance` (paged by `cursor`, at most 1,000 entries), `locale.integrity` and `key.context`.
- `translation.estimate` prices a run without calling a provider. `translation.translatePending` takes `locales` and `maxTokens`, sends progress notifications, lists keys the `sensitiveData` guard withheld, and stops on `notifications/cancelled` while keeping finished batches.

**Values redacted**
- `--redact-values` (or `VERBATRA_MCP_REDACT_VALUES`) replaces every source text, translation, description and glossary term in a result with a marker holding its length and a per-session hash. Key names, counts, statuses and paths stay, and `project.snapshot` reports `valuesRedacted`.
- In that mode `review.approve` and `review.reject` take the marker's hash as `expectedHash`, `locale.values` refuses `query`, `key.context` refuses `draft`, and spend tools still need `--allow-spend`.
