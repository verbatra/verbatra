<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/verbatra/main/.github/assets/verbatra-mark.png" alt="verbatra logo, a glowing V mark on a dark square" width="96" height="96" />
</p>

<h1 align="center">@verbatra/mcp</h1>

<p align="center">
  Stdio MCP server exposing verbatra's translation status, glossary, and editing tools to any MCP client, without a browser.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@verbatra/mcp"><img src="https://img.shields.io/npm/v/@verbatra/mcp?label=%40verbatra%2Fmcp" alt="@verbatra/mcp npm version" /></a>
  <a href="https://github.com/verbatra/verbatra/actions/workflows/ci.yml"><img src="https://github.com/verbatra/verbatra/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://codecov.io/gh/verbatra/verbatra"><img src="https://codecov.io/gh/verbatra/verbatra/graph/badge.svg" alt="Coverage" /></a>
  <a href="https://github.com/verbatra/verbatra/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
</p>

## Description

`@verbatra/mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, the standard local-process transport MCP clients such as Claude Desktop, Claude Code, and Cursor use to launch and talk to a tool server. It gives a terminal-hosted or headless agent the same translation-status, glossary, and editing capabilities Verbatra Studio's browser agent tools expose, without a browser, a port, or a served single-page app. It is a thin, SDK-backed surface over [`@verbatra/sdk`](https://github.com/verbatra/verbatra/tree/main/packages/sdk), the same way [`@verbatra/cli`](https://github.com/verbatra/verbatra/tree/main/packages/cli) is.

## Requirements

Node.js `>=22.14.0`.

## Installation

```bash
npm install --save-dev @verbatra/mcp
# pnpm
pnpm add -D @verbatra/mcp
# yarn
yarn add -D @verbatra/mcp
```

Most MCP clients spawn the server for you and never need a local install at all: point the client at `npx -y @verbatra/mcp` (shown below) and npx fetches it on demand.

`@verbatra/mcp` is also reachable through the CLI's `verbatra mcp` subcommand once both `@verbatra/cli` and `@verbatra/mcp` are installed, resolved through a dynamic import so the rest of the CLI keeps working without it.

## The `verbatra-mcp` binary

```bash
verbatra-mcp [flags]
```

| Flag | Argument | Default | Effect |
| --- | --- | --- | --- |
| `--cwd` | `<path>` | current directory | resolve config and locale files from this directory |
| `--config` | `<path>` | search for one | load this config file instead of searching for one |
| `--allow-spend` | none | off | advertise the two tools that call a translation provider |

When `--allow-spend` is absent, the server reads the `VERBATRA_MCP_ALLOW_SPEND` environment variable instead: `1`, `true`, `yes`, or `on` (case-insensitive) counts as on, and the CLI flag always wins over the environment variable. The MCP stdio transport uses stdout exclusively for protocol messages, so nothing is ever printed there; every log and diagnostic line goes to stderr instead, and nothing is printed at all until an MCP client sends the first message.

## Configuring an MCP client

Point your MCP client at the `verbatra-mcp` binary. For Claude Desktop, add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "verbatra": {
      "command": "npx",
      "args": ["-y", "@verbatra/mcp", "--cwd", "/path/to/your/project"],
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Omit the `env` block, and `--allow-spend`, entirely for a read-only and local-editing-only server: the project snapshot, the status and glossary tools, and manual entry editing never call a provider or need a key. Add `--allow-spend` to `args` once you also want the provider-calling tools available, and set the environment variable your configured provider reads its key from (see the [Providers page](https://verbatra.kreitz-webdev.de/docs/providers)).

## Tools

Thirteen tools are exposed in total, covering project status, the glossary, key-level integrity and values, translation editing, the review queue, and usage summaries. Two of them, retranslating a single key and translating every pending change, call a translation provider and spend budget; they are advertised only when the server is started with `--allow-spend` or `VERBATRA_MCP_ALLOW_SPEND`. Without either, an MCP client that lists tools never sees them, and calling one by name fails as an unknown tool: this is a per-process guarantee, not a per-call check, so a spend-gated tool is structurally uncallable rather than merely refused at call time. Every tool's input, and every closed-shape tool output, is a JSON Schema derived from the same zod schema the server validates the call against.

Every tool result and log line passes through the same secret-redaction pass Studio uses: a value shaped like a provider API key, or the exact current value of a configured provider environment variable, is replaced with `[REDACTED]` before it ever reaches the client or stderr.

See the [`verbatra mcp` docs](https://verbatra.kreitz-webdev.de/docs/cli/mcp) for the full tool reference, the exit-code contract, and worked examples.

## Documentation

- [Documentation site](https://verbatra.kreitz-webdev.de)
- [`verbatra mcp` reference](https://verbatra.kreitz-webdev.de/docs/cli/mcp)
- [Project README](https://github.com/verbatra/verbatra)
- [`@verbatra/sdk`](https://github.com/verbatra/verbatra/tree/main/packages/sdk) for the programmatic API

## License

[MIT](https://github.com/verbatra/verbatra/blob/main/LICENSE) (c) Mario Kreitz
