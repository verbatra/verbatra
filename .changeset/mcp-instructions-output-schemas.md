---
"@verbatra/mcp": minor
---

Send server instructions, and declare an output schema for every tool.

Previously the server sent no `instructions`, and `project.snapshot`, `status.check`,
`status.diff`, `review.queue`, and `translation.translatePending` returned text content only. The
server now answers `initialize` with fixed instructions covering the recommended order of calls,
the spend gate, protected keys, untrusted content, and redaction. Every tool declares an
`outputSchema` and returns matching `structuredContent`; a result that breaks its schema fails with
`OUTPUT_SCHEMA_MISMATCH` instead of being sent. Tool descriptions now say when to use each tool,
what it costs, and what it never does, and `translation.editEntry`,
`translation.retranslateEntry`, and `translation.translatePending` are annotated as destructive.
