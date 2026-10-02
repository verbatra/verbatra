# 1. The MCP server offers stdio only

- Status: accepted
- Date: 2026-10-02
- Applies to: `@verbatra/mcp`, `@verbatra/cli` (`verbatra mcp`)

## Context

`@verbatra/mcp` serves one verbatra project over stdio (`startMcpServer` in
`packages/mcp/src/start-server.ts`). The client launches the server as a child process, and the
server reads and writes that project's local files: the config, the locale files, the lock file,
the provenance file and the glossary. With `--allow-spend` it also calls the configured
translation provider and bills it.

The MCP specification defines a second transport, Streamable HTTP, and its 2026-07-28 revision
keeps it (https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http). Several translation-management vendors now offer remote HTTP MCP servers, but those
front a hosted SaaS backend. verbatra has no backend: the project lives on the user's disk.

Streamable HTTP has its own security requirements. The server MUST validate the `Origin` header
of every connection against DNS rebinding, SHOULD bind to localhost only, and authentication is
strongly recommended. verbatra implements that hardening once, for Studio
(`packages/studio/src/server/host-origin.ts`, `token.ts`, `rate-limiter.ts`,
`security-headers.ts`). `@verbatra/mcp` must not depend on `@verbatra/studio` to reuse it:
studio versions independently and ships a prebuilt single-page app, so the MCP server would pull
a dashboard and its release cycle into every install. An HTTP transport would first need that
hardening extracted into a shared package both can depend on.

## Decision

The MCP server offers stdio only, and no HTTP transport is added for now.

- Every MCP client verbatra supports launches stdio servers, so HTTP would not reach a client
  stdio cannot.
- A listener would put the write tools, and with `--allow-spend` the provider-spending tools, on a
  port that any local process, and any web page that gets past the origin check, can reach. Over
  stdio only the process that launched the server can call them.
- One server process works on one project. Sharing it between several clients would need
  per-client sessions and locking that the stdio design does not have.

`apps/docs/content/docs/cli/mcp.mdx` states that the server has no HTTP transport and why.

## Revisit when

- A client that verbatra users rely on supports only HTTP servers.
- A devcontainer or remote-sandbox setup needs the client and the project on different hosts.
- Users ask to share one running server between several clients.

A change of this decision starts by moving Studio's origin, token, rate-limit and header
hardening into a shared package, then adds the HTTP transport behind an explicit opt-in flag that
binds to localhost by default.

## Consequences

- No port, token or origin handling in `@verbatra/mcp`; the attack surface stays the launching
  process.
- A user who needs remote access has to run the client next to the project, for example inside
  the same devcontainer.
