---
"@verbatra/cli": patch
---

Point the missing-package hints of `verbatra mcp` and `verbatra studio` at commands that work.

Previously both hints suggested `pnpm add -D`, which does not help after `npx -y @verbatra/cli`.
`verbatra mcp` now points at `npx -y @verbatra/mcp` or installing `@verbatra/mcp` next to the
CLI, and `verbatra studio` at installing `@verbatra/studio` next to the CLI or
`npx -y -p @verbatra/cli -p @verbatra/studio verbatra studio`. `verbatra mcp` also starts in
`CLAUDE_PROJECT_DIR` when no `--cwd` is given and the installed `@verbatra/mcp` supports it.
