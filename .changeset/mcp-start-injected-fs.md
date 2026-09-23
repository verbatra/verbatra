---
"@verbatra/mcp": patch
---

Read the config's glossary file through the `fs` passed to `startMcpServer`.

Previously `startMcpServer` loaded a file-backed glossary from the real file system even when an
`fs` was injected, while the tools used the injected one. The glossary file is now read through
the injected `fs` at startup too, so an embedder or test can run the server against an in-memory
file system. The config file itself is still read from disk.
