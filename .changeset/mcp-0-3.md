---
"@verbatra/mcp": minor
---

Config-less start, review, glossary and read tools, values-redacted mode, progress, spend limits.

**Upgrading from 0.2**
- `glossary.get` no longer returns `entries`: it returns `version`, `terms` and `doNotTranslate`.
  In `glossary.write`, `translation: null` clears only the shared translation.
- `review.queue` lists every unapproved machine-written value from the committed files.
  `available: false` means the provenance file cannot be read, locales lose `status` and `usage`,
  and the run's time is `lastRunAt`.
- The server starts without a config (other tools refuse) and reloads config changes.
  `project.snapshot` always carries `configured`.
- Unknown `verbatra-mcp` flags exit 2 instead of being ignored, and `--help` and `--version` no
  longer start the server.
- The default project directory is `CLAUDE_PROJECT_DIR` when it is set.
- Tools resolve locale, lock and glossary paths against the directory of the config the search
  found, so a server started in a subdirectory, as Codex CLI does, works on the project's files.
- A failed tool's text leads with its error code, `key.integrity` fails with `UNKNOWN_KEY` for an
  unknown key, and every tool returns `structuredContent`.
- Write tools wait 30 seconds for a lock by default instead of ten minutes.
  `translation.translatePending` runs one call at a time, and spend tools are hidden under
  `provider: none`.
- Values written through `translation.editEntry` are recorded as `agent`.

**Setup and lifecycle**
- Without a usable config, `project.snapshot` reports the problem and the new `project.doctor`
  tool runs the setup checks. A created or fixed config takes effect on the next call, with
  `notifications/tools/list_changed` when the tool list changes.
- `verbatra-mcp` prints ready and stopped lines on stderr, closes when the client closes stdin,
  and on an interrupt shuts down within two seconds, releasing its locale locks.
- The server sends `instructions`, and every tool declares an `outputSchema`.
- The server speaks MCP protocol revision 2026-07-28 (`server/discover`, `subscriptions/listen`)
  and keeps serving clients on the earlier revisions back to 2024-10-07 unchanged.
- `package.json` declares `mcpName` for the official MCP Registry, and `./package.json` is exported.

**Tools**
- `review.approve` and `review.reject` record a person's decision, with the reviewed value and a
  required `reviewer`. They write local files only and are always listed.
- `glossary.get` and `glossary.write` read and edit per-locale translations, forbidden renderings
  and do-not-translate terms. An unknown locale fails with `UNKNOWN_LOCALE`.
- New read tools: `history.list` (locale file commits with the author name, never the email),
  `locale.values` (search values in bulk), `locale.integrity` (every broken translation),
  `key.context` (glossary terms, `maxLength` and a draft check for one key) and
  `report.provenance` (provenance counts, with the keys on request).
- `locale.values` and `report.provenance` return at most 1,000 entries per call and page with
  `cursor` and `nextCursor`.
- `translation.estimate` prices a run without calling a provider, and
  `translation.translatePending` takes `locales` and a `maxTokens` ceiling.
- `translation.translatePending` sends `notifications/progress` as batches finish when the call
  carries a `progressToken`.
- Cancelling `translation.translatePending` or `translation.retranslateEntry` with
  `notifications/cancelled` stops the run and releases its locks; a cancelled run keeps what
  arrived and records its status, and no result or progress follows.
- `translation.translatePending` lists keys the config's `sensitiveData` guard kept from the
  provider under `sensitiveWithheld`, and `translation.retranslateEntry` fails with
  `SENSITIVE_CONTENT_WITHHELD` for such a key.
- `translation.translatePending` and `translation.estimate` report `integrityRefusals`, and
  `key.integrity` reports `icuArmsMatch` and `icuArmDetails`.
- `key.value` returns the key's `description`, and read tools return provenance fields, described
  in each tool's description along with protected and pinned keys.
- Write tools take `lockTimeoutMs`. A failed call ends with a `Next step:` line, and error messages
  use project-relative paths, also when `--cwd` is a relative path.
- An `apiKeyEnvVar` value is redacted from every result, and `startMcpServer` reads the glossary
  through an injected `fs`.
- `status.check`, `status.diff`, `lock.state` and the run results carry `emptySource`: source
  keys with an empty value, which are no longer counted as missing, stale or up to date.

**Values redacted**
- `--redact-values` (also `verbatra mcp --redact-values`, or `VERBATRA_MCP_REDACT_VALUES`) replaces
  every source text, translation, description, and glossary term in a result with a marker
  carrying the value's length and a per-session hash, and leaves reviewer and author names out.
  Key names, counts, statuses, integrity verdicts, commit subjects and paths stay;
  `project.snapshot` reports `valuesRedacted`, and the exported `MCP_CAPABILITIES` lets a host
  check support first.
- In that mode `review.approve` and `review.reject` take only the marker's hash as `expectedHash`,
  `glossary.write` answers with counts, `translation.editEntry` still writes, and `locale.values`
  refuses `query` and `key.context` refuses `draft`. The message of an error that can carry
  values is replaced by a marker; its code and next step stay. Spend tools still need
  `--allow-spend`. It does not stop an agent that probes on purpose.
