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
  <a href="https://scorecard.dev/viewer/?uri=github.com/verbatra/verbatra"><img src="https://img.shields.io/ossf-scorecard/github.com/verbatra/verbatra?label=openssf%20scorecard&amp;labelColor=0b0b12" alt="OpenSSF Scorecard" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/mcp#provenance"><img src="https://img.shields.io/badge/npm%20provenance-SLSA%20v1-7b1fa2?labelColor=0b0b12" alt="npm provenance: SLSA v1 build attestation" /></a>
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
pnpm add --save-dev @verbatra/mcp
# yarn
yarn add --dev @verbatra/mcp
# bun
bun add --dev @verbatra/mcp
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

In Claude Code, `claude mcp add --transport stdio --scope project verbatra -- npx -y @verbatra/mcp` writes an equivalent entry to a committed `.mcp.json`, and the [verbatra plugin](https://verbatra.kreitz-webdev.de/docs/connect-an-mcp-client#the-verbatra-plugin) adds the agent skills alongside it. VS Code (GitHub Copilot's agent mode) reads `.vscode/mcp.json`, whose top-level key is `servers` rather than `mcpServers`. The exact file, key, and working-directory handling for every client is in [Connect an MCP client](https://verbatra.kreitz-webdev.de/docs/connect-an-mcp-client).

That configuration is read-only plus local editing: no provider is called and no API key is needed. Add `--allow-spend` to `args`, and the environment variable your configured provider reads its key from, once you also want the two provider-calling tools. `--config <path>` loads a specific config file instead of searching for one, and `VERBATRA_MCP_ALLOW_SPEND` is the environment equivalent of the flag, which the flag always wins over.

## Tools

Fourteen tools, listed here in the order the server advertises them.

| Tool | What it does |
| --- | --- |
| `project.snapshot` | Read the resolved project configuration: locales, format, path pattern, provider id, where the config came from, whether a glossary is configured |
| `status.check` | Per target locale, how many keys are missing, stale, or up to date, and whether the locale is in sync |
| `status.diff` | Per target locale, the exact keys the next translate run would add, re-translate, or orphan |
| `glossary.get` | Every glossary term with its translation for all locales, per-locale translations, forbidden renderings, case sensitivity, note and part of speech, the terms kept untranslated, the glossary version and where it comes from; with `locale`, also the terms that locale is held to |
| `glossary.write` | Change one glossary term (a translation for all locales or one `locale`, `forbidden` renderings, `note`, `partOfSpeech`, `caseSensitive`, or `doNotTranslate`) and return the glossary afterward |
| `lock.state` | The lock file's version and its per-locale key counts, or `exists: false` before the first run |
| `key.integrity` | One key's placeholder, inline markup, and ICU drift against the lock-file baseline, per locale |
| `key.value` | One key's current source text, its source file description, and, if translated, its current text in one target locale with who wrote it |
| `translation.editEntry` | Write a manual translation for one key in one locale, accepted only if it passes the integrity gate |
| `translation.estimate` | Estimate what `translation.translatePending` would send and cost, optionally for a subset of locales, without calling a provider |
| `translation.retranslateEntry` | Ask the configured provider for a fresh translation of one key in one locale |
| `translation.translatePending` | Translate every missing or stale key across the configured target locales, or a named subset, in one run, within an optional `maxTokens` ceiling |
| `review.queue` | Every machine-written translation nobody has approved yet, read from the committed files, with the last run's flags |
| `review.approve` | Record, on the user's instruction, that a named person approves one key's current translation |
| `review.reject` | Record, on the user's instruction, that a named person rejects one key's current translation, removing it so it gets replaced |
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
