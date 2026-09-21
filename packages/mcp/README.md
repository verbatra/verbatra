<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/verbatra/main/.github/assets/verbatra-mark.png" alt="verbatra logo, a glowing V mark on a dark square" width="96" height="96" />
</p>

<h1 align="center">@verbatra/mcp</h1>

<p align="center">
  Stdio MCP server exposing verbatra's translation status, glossary, and editing capabilities as tools for any MCP client, without a browser.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@verbatra/mcp"><img src="https://img.shields.io/npm/v/%40verbatra%2Fmcp?label=%40verbatra%2Fmcp&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="@verbatra/mcp npm version" /></a>
  <a href="https://github.com/verbatra/verbatra/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/verbatra/verbatra/ci.yml?branch=main&amp;label=CI&amp;labelColor=0b0b12" alt="CI status on main" /></a>
  <a href="https://github.com/verbatra/verbatra/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?color=7b1fa2&amp;labelColor=0b0b12" alt="License: MIT" /></a>
</p>

## Description

`@verbatra/mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, the standard local-process transport an MCP client uses to launch and talk to a tool server. It gives a terminal-hosted or headless agent the same translation-status, glossary, and editing capabilities Verbatra Studio exposes in the browser, without a browser, a port, or a served single-page app. It is a thin, SDK-backed surface over [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk), the same way [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli) is.

Because the transport is stdio, nothing but a valid MCP protocol message is ever written to stdout. Every log and diagnostic line goes to stderr instead, including anything a failed startup reports before a client has sent its first message.

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

Most MCP clients spawn the server for you and need no local install at all: point the client at `npx -y @verbatra/mcp` and npx fetches it on demand. The server is also reachable through `verbatra mcp` once both `@verbatra/cli` and `@verbatra/mcp` are installed.

## Configuring an MCP client

Point your client at the `verbatra-mcp` binary. The shape below is the one most clients use; for an editor or desktop client, put it in that client's MCP server configuration file.

```json
{
  "mcpServers": {
    "verbatra": {
      "command": "npx",
      "args": ["-y", "@verbatra/mcp", "--cwd", "/path/to/your/project"],
      "env": {}
    }
  }
}
```

That configuration is read-only plus local editing: no provider is called and no API key is needed. Add `--allow-spend` to `args`, and the environment variable your configured provider reads its key from, once you also want the two provider-calling tools. `--config <path>` loads a specific config file instead of searching for one, and `VERBATRA_MCP_ALLOW_SPEND` is the environment equivalent of the flag, which the flag always wins over.

## Tools

Thirteen tools, listed here in the order the server advertises them.

| Tool | What it does |
| --- | --- |
| `project.snapshot` | Read the resolved project configuration: locales, format, path pattern, provider id, where the config came from, whether a glossary is configured |
| `status.check` | Per target locale, how many keys are missing, stale, or up to date, and whether the locale is in sync |
| `status.diff` | Per target locale, the exact keys the next translate run would add, re-translate, or orphan |
| `glossary.get` | Every configured term and its translation, plus where the glossary comes from |
| `glossary.write` | Add, replace, or remove one glossary term, and return the glossary afterward |
| `lock.state` | The lock file's version and its per-locale key counts, or `exists: false` before the first run |
| `key.integrity` | One key's placeholder, inline markup, and ICU drift against the lock-file baseline, per locale |
| `key.value` | One key's current source text and, if translated, its current text in one target locale |
| `translation.editEntry` | Write a manual translation for one key in one locale, accepted only if it passes the integrity gate |
| `translation.retranslateEntry` | Ask the configured provider for a fresh translation of one key in one locale |
| `translation.translatePending` | Translate every missing or stale key across every configured target locale in one run |
| `review.queue` | The keys the last run flagged for human review, with the reason for each |
| `usage.summary` | Token usage and budget status left behind by the last run |

`translation.retranslateEntry` and `translation.translatePending` are the two that call a provider and spend budget. They are advertised only when the server is started with `--allow-spend` or `VERBATRA_MCP_ALLOW_SPEND`. Without either, a client listing tools never sees them and calling one by name fails as an unknown tool: the gate is per process, so a spend tool is structurally uncallable rather than refused at call time.

Every tool's input, and every closed-shape tool output, is a JSON Schema derived from the same zod schema the server validates the call against. Every result and log line passes through a secret-redaction pass first, so a value shaped like a provider API key, or the exact current value of a configured provider environment variable, is replaced with `[REDACTED]` before it reaches the client or stderr.

See the [`verbatra mcp` docs](https://verbatra.kreitz-webdev.de/docs/cli/mcp) for the full tool reference, the exit-code contract, and worked examples.

## Documentation

- [Documentation site](https://verbatra.kreitz-webdev.de)
- [`verbatra mcp` reference](https://verbatra.kreitz-webdev.de/docs/cli/mcp)
- [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk) for the programmatic API

## License

[MIT](https://github.com/verbatra/verbatra/blob/main/LICENSE) (c) Mario Kreitz
