---
"@verbatra/cli": patch
---

Fix the `studio` and `mcp` commands to catch a `.env`/`.env.local` read failure (for example, a directory in place of the file) and exit 2 with a structured error, instead of crashing with an unhandled raw error, matching the existing behavior of `translate` and `watch`.
