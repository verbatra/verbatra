---
"@verbatra/mcp": patch
---

Parse the `verbatra-mcp` arguments strictly, and answer `--help` and `--version`.

Previously `verbatra-mcp` ignored any flag it did not know, so a typo such as `--allowspend`
silently started the server with the spend tools off, and `--help` or `--version` started the
server and waited on stdin for a client that never came. A flag missing its value exited `1`.

Now `--help` (`-h`) prints the usage and `--version` (`-V`) prints the `@verbatra/mcp` version, both
exiting `0` without starting the server. An unknown flag, including `--json`, a flag missing its
value, or a stray argument prints a `USAGE_ERROR` line on stderr, suggests the flag a typo was
meant to be, and exits `2`.
