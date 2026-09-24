---
"@verbatra/sdk": patch
---

Stop config load failures from quoting the config file's content.

Previously a malformed JSON or YAML config surfaced the parser's message as `CONFIG_INVALID`,
including its snippet or code frame of the surrounding lines, so a key written into the file could
reach a terminal, a log, or an agent. The message now names the file and, for YAML, the line and
column, without any content, and every load and validation message passes through `redact`.
