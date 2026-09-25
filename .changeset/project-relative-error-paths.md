---
"@verbatra/sdk": minor
"@verbatra/cli": minor
"@verbatra/studio": patch
"@verbatra/mcp": patch
---

Name project files by their project-relative path in error messages, and export
`projectRelativeMessage`.

Previously a locale that failed on a file inside the project, such as a corrupt target file,
reported that file's absolute path in its `error.message`, and so did its notices, so
`translation.translatePending` returned the machine's directory layout to an MCP client, a Studio
RPC error sent it to the browser tab, and the CLI printed it in a whole-run error.

Now every per-locale `error.message` and notice message on a `RunSummary` from `translate`,
`watch` and `importWorkbook` names a project file relative to the run's `cwd`, such as
`locales/de.json`, and a path outside the project stays absolute. Studio makes the message of an
error an RPC call returns relative to the project root, and the CLI makes an error line relative
to the working directory, like the file paths it already prints. The SDK exports the rewrite as
`projectRelativeMessage(message, cwd)`, which `verbatra mcp` now uses for the errors it returns.
