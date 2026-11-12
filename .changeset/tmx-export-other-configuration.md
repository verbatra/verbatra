---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Say when `verbatra tmx export` leaves memory entries out.

- **Text output:** a line now names how many entries were left out because they are stored under an earlier provider, model, tone or glossary configuration.
- **SDK and JSON:** `ExportTmxResult` and the `--json` result gain an optional `otherConfiguration` count.
