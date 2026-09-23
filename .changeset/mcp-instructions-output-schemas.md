---
"@verbatra/mcp": minor
---

Send server instructions, and declare an output schema for every tool.

Previously the server sent no `instructions`, and `project.snapshot`, `status.check`,
`status.diff`, `review.queue`, and `translation.translatePending` returned text content only. The
server now answers `initialize` with fixed instructions covering the recommended order of calls,
the spend gate, protected keys, untrusted content, and redaction. Every tool declares an
`outputSchema` and returns matching `structuredContent`. Output schemas allow properties they do
not name, so a later field never breaks a client, while a missing or mistyped field fails with
`OUTPUT_SCHEMA_MISMATCH` instead of being sent. Tool descriptions now say when to use each tool,
what it costs, and what it never does, and `translation.editEntry`,
`translation.retranslateEntry`, and `translation.translatePending` are annotated as destructive.
`project.snapshot` also reports the effective `humanEdits` policy and `prune` setting, and a
mismatch from a tool that writes says its changes were applied and must not be retried.
