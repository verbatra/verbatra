---
"@verbatra/sdk": minor
"@verbatra/cli": minor
"@verbatra/studio": minor
"@verbatra/mcp": minor
---

Node.js 22.22 is now the minimum on the 22 line, and file watching moves to chokidar 6.

- **Upgrade:** the supported range changes from `^22.18.0 || >=24` to `^22.22.0 || >=24`. On Node 22.18 to 22.21 the install is refused or warns. Upgrade Node to 22.22 or newer, or use 24 or 26.
- **Dependencies:** chokidar 5.0.0 -> 6.0.0 (`@verbatra/sdk`, `@verbatra/studio`).
