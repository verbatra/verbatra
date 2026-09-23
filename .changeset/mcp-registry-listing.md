---
"@verbatra/mcp": patch
---

Declare the `mcpName` the official MCP Registry uses to verify the npm package.

Previously `@verbatra/mcp` carried no `mcpName`, so the registry could not tie a listing to the
npm package and clients browsing the registry could not find verbatra.

Now `package.json` declares `io.github.verbatra/verbatra`, and each release publishes a matching
`server.json` to the registry right after the npm package.
