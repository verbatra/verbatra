---
"@verbatra/sdk": patch
---

Leave an absolute path outside the project untouched when `projectRelativeMessage` rewrites a message.

- **Error messages:** a path such as `/usr/lib/app/config.json` is no longer shortened to `/usr/libconfig.json` when the project root is `/app`, and a URL such as `https://host/work/proj/x` is no longer cut when the project root is `/work/proj`. This reaches `RunSummary` error messages, the CLI, `verbatra mcp` and Studio.
