---
"@verbatra/mcp": minor
---

Config-less start and reload, review and glossary v2 tools, spend limits, structured output.

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
- `translation.translatePending` lists keys the config's `sensitiveData` guard kept from the
  provider under `sensitiveWithheld`, and `translation.retranslateEntry` fails with
  `SENSITIVE_CONTENT_WITHHELD` for such a key.
- `translation.translatePending` and `translation.estimate` report `integrityRefusals`, and
  `key.integrity` reports `icuArmsMatch` and `icuArmDetails`.
- `key.value` returns the key's `description`, and read tools return provenance fields, described
  in each tool's description along with protected and pinned keys.
- Write tools take `lockTimeoutMs`. A failed call ends with a `Next step:` line, and error messages
  use project-relative paths.
- An `apiKeyEnvVar` value is redacted from every result, and `startMcpServer` reads the glossary
  through an injected `fs`.
