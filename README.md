<p align="center">
  <img src=".github/assets/banner.webp" alt="verbatra: automated i18n translation for modern applications" />
</p>

<h1 align="center">verbatra</h1>

<p align="center">
  Automate i18n translation: only what changed gets translated, and nothing that breaks a placeholder gets written.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@verbatra/cli"><img src="https://img.shields.io/npm/v/%40verbatra%2Fcli?label=%40verbatra%2Fcli&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="@verbatra/cli npm version" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/sdk"><img src="https://img.shields.io/npm/v/%40verbatra%2Fsdk?label=%40verbatra%2Fsdk&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="@verbatra/sdk npm version" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/%40verbatra%2Fcli?color=7b1fa2&amp;labelColor=0b0b12" alt="Required Node.js version" /></a>
  <a href="https://github.com/verbatra/verbatra/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/verbatra/verbatra/ci.yml?branch=main&amp;label=CI&amp;labelColor=0b0b12" alt="CI status on main" /></a>
  <a href="https://codecov.io/gh/verbatra/verbatra"><img src="https://img.shields.io/codecov/c/github/verbatra/verbatra?labelColor=0b0b12" alt="Test coverage" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/verbatra/verbatra"><img src="https://img.shields.io/ossf-scorecard/github.com/verbatra/verbatra?label=openssf%20scorecard&amp;labelColor=0b0b12" alt="OpenSSF Scorecard" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/cli#provenance"><img src="https://img.shields.io/badge/npm%20provenance-SLSA%20v1-7b1fa2?labelColor=0b0b12" alt="npm provenance: SLSA v1 build attestation" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?color=7b1fa2&amp;labelColor=0b0b12" alt="License: MIT" /></a>
</p>

<p align="center">
  <a href="https://verbatra.kreitz-webdev.de">Documentation</a> |
  <a href="#install-and-quick-start">Quick start</a> |
  <a href="#packages">Packages</a> |
  <a href="./CONTRIBUTING.md">Contributing</a> |
  <a href="./SECURITY.md">Security</a>
</p>

## What it is

verbatra translates your application's locale files for you. You maintain the source locale by hand, and as strings are added or change, verbatra fills in every target locale through the AI or machine-translation provider you choose. A lock file, `verbatra.lock.json`, records the content hash of every string it has already translated, so each run sends only the genuinely new or changed keys to the provider.

The part that matters when a run goes wrong is the integrity gate. Every candidate value, from a provider, a filled translator workbook, a TMX import, a manual edit in Studio, or a cache hit, is re-checked at the single accept point every write path calls. A value that drops or renames a placeholder, breaks inline markup, fails to parse as ICU, or comes back empty is withheld and reported instead of written, and the previous translation stays intact.

## Install and quick start

Needs Node.js `^22.18.0 || >=24`.

```bash
# 1. Install as a dev dependency
npm install --save-dev @verbatra/cli

# 2. Scaffold verbatra.config.ts and .env.example (choose your provider)
npx @verbatra/cli init --provider gemini

# 3. Provide the provider's API key, in .env or exported (Gemini shown)
export GEMINI_API_KEY=your-key-here

# 4. Translate every target locale once
npx @verbatra/cli translate
```

Gemini is the cheapest way to try verbatra, because its API has a real free tier: create a key at [Google AI Studio](https://aistudio.google.com/apikey). Pass another provider to `--provider`, or `none` to translate by hand only; see [Providers](https://verbatra.kreitz-webdev.de/docs/providers). pnpm users need one extra step before installing; see [Troubleshooting](https://verbatra.kreitz-webdev.de/docs/troubleshooting).

## Features

- **Incremental by default.** The lock file makes every run diff-driven, so a run over an unchanged project calls no provider at all, and `verbatra watch` re-translates as your source changes.
- **Many formats, one engine.** i18next, vue-i18n, next-intl, ngx-translate, XLIFF, YAML, Flutter ARB, gettext, Android, Apple, .NET and more, each round-tripped in its own key order. See [Formats](https://verbatra.kreitz-webdev.de/docs/formats).
- **Many providers, one interface.** LLMs, DeepL, Google Cloud Translation, a self-hosted LibreTranslate or openai-compatible server, or `none` for a human-only project. See [Providers](https://verbatra.kreitz-webdev.de/docs/providers).
- **Read-only CI gates.** `verbatra check`, `diff`, `report`, and `doctor` call no provider, need no API key, and write no file; `check`, `diff`, and `doctor` exit non-zero on drift or problems; `check --require-reviewed` also fails while a machine-written translation is not approved.
- **Manual translation handoff.** Export the strings that need a human into an Excel workbook, CSV, TSV, or XLIFF, import the filled file back through the same integrity gate, and move the whole memory in or out as TMX.
- **Machine-translation evidence.** Every value records the write path that produced it and whether a person reviewed it; `verbatra report provenance --json` turns that into a per-key audit file. Supporting evidence, not legal advice.
- **Source-code extraction and types.** `verbatra extract` adds the keys your code uses to the source locale, `diff --unused` names the ones nothing references, and `verbatra types` generates typed catalog keys.
- **Spend before you spend.** `--dry-run` and `--estimate` preview a run without calling a provider, and `verbatra pseudo` builds a pseudolocale that exposes truncated layouts before you have a key.
- **Keys stay in your environment.** API keys are read only from environment variables, never from a config file, a CLI argument, or a function argument.

## Packages

| Package | Version | What it is | Docs | Changelog |
| --- | --- | --- | --- | --- |
| [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli) | <img src="https://img.shields.io/npm/v/%40verbatra%2Fcli?label=%20&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="@verbatra/cli version" /> | The `verbatra` binary for your terminal and CI | [CLI](https://verbatra.kreitz-webdev.de/docs/cli) | [CHANGELOG](./packages/cli/CHANGELOG.md) |
| [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk) | <img src="https://img.shields.io/npm/v/%40verbatra%2Fsdk?label=%20&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="@verbatra/sdk version" /> | The same engine as a programmatic API; the CLI is a thin wrapper over it | [SDK](https://verbatra.kreitz-webdev.de/docs/sdk) | [CHANGELOG](./packages/sdk/CHANGELOG.md) |
| [`@verbatra/studio`](https://www.npmjs.com/package/@verbatra/studio) | <img src="https://img.shields.io/npm/v/%40verbatra%2Fstudio?label=%20&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="@verbatra/studio version" /> | Verbatra Studio, the local dashboard served by `verbatra studio` | [Studio](https://verbatra.kreitz-webdev.de/docs/cli/studio) | [CHANGELOG](./packages/studio/CHANGELOG.md) |
| [`@verbatra/mcp`](https://www.npmjs.com/package/@verbatra/mcp) | <img src="https://img.shields.io/npm/v/%40verbatra%2Fmcp?label=%20&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="@verbatra/mcp version" /> | A stdio MCP server exposing verbatra's tools to an MCP client | [MCP](https://verbatra.kreitz-webdev.de/docs/cli/mcp) | [CHANGELOG](./packages/mcp/CHANGELOG.md) |
| [`verbatra/action`](https://github.com/verbatra/action) | <img src="https://img.shields.io/github/v/release/verbatra/action?sort=semver&amp;label=%20&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="verbatra/action release" /> | A composite GitHub Action, consumed with `uses:` | [Action](https://verbatra.kreitz-webdev.de/docs/github-action) | [Releases](https://github.com/verbatra/action/releases) |

`verbatra studio` serves a local dashboard with translation status, a review queue shared through the committed provenance file, an activity page (the git history of your locale files plus the last run's token usage), and the resolved config with an editable glossary. It binds to `127.0.0.1` only, and local editing runs through the same integrity gate. Actions that spend provider budget exist only when you start it with `--allow-spend` or `VERBATRA_STUDIO_ALLOW_SPEND`, and a `provider: none` project never offers them.

The GitHub Action runs `translate`, `check`, or `diff` in CI, turns each failed or partial locale into an error annotation, writes a job summary, and exits with the CLI's own exit code. The one exception is a human-only `translate` that exits `3` with keys left for a person: the step passes with a warning. `check` and `diff` need no API key, so they are safe on a fork pull request.

The workspace packages below are private: they are bundled into `@verbatra/sdk` (except `config`) and not published on their own.

| Package | Role |
| --- | --- |
| [`core`](./packages/core/README.md) | Pure domain model: diffing, hashing, placeholder integrity |
| [`format-adapters`](./packages/format-adapters/README.md) | File formats to and from the neutral representation |
| [`ai-providers`](./packages/ai-providers/README.md) | Translation provider strategies |
| [`exchange`](./packages/exchange/README.md) | Excel, CSV, XLIFF and TMX interchange |
| [`extract`](./packages/extract/README.md) | Source-code extraction of translation call sites |
| [`config`](./packages/config/README.md) | Shared build, TypeScript, lint and test configuration |
| [`apps/docs`](./apps/docs/README.md) | The documentation site |
| [`e2e`](./e2e/README.md) | End-to-end tests of the published packages |

Third-party formats and providers can be added from outside: the SDK re-exports the adapter factories and accepts a registry of your own. See [Custom format adapters](https://verbatra.kreitz-webdev.de/docs/custom-format-adapters).

## Use with AI agents

verbatra is built to be driven by a coding agent as well as by a person:

- **MCP server.** `npx -y @verbatra/mcp` serves a project over stdio to Claude Code, Codex, Gemini CLI, Cursor, VS Code, GitHub Copilot, Windsurf, Zed, JetBrains AI Assistant, Claude Desktop, and any other stdio client. Tools that call a paid provider stay off the tool list until spending is granted. See [Connect an MCP client](https://verbatra.kreitz-webdev.de/docs/connect-an-mcp-client).
- **Claude Code plugin.** `claude plugin marketplace add verbatra/skills`, then `claude plugin install verbatra@verbatra --scope project`, installs the skills, the MCP server with spending off, and a hook that checks edited locale files. Use it instead of a `verbatra` entry in `.mcp.json`, never both: together they register the server twice. The skill documents live in [verbatra/skills](https://github.com/verbatra/skills).
- **Machine-readable CLI.** Every one-shot command takes `--json` and exits `0`, `1`, or `2` (plus `3` for a human-only project, and `130` or `143` when interrupted), so an agent branches on the code rather than parsing prose. See [Recipes for agents and scripts](https://verbatra.kreitz-webdev.de/docs/agent-recipes).
- **Docs an agent can read.** [llms.txt](https://verbatra.kreitz-webdev.de/llms.txt) indexes every page, [llms-full.txt](https://verbatra.kreitz-webdev.de/llms-full.txt) holds the full text, and any docs URL returns Markdown with `.md` appended or with `Accept: text/markdown`.
- **Set it up for someone.** [Start with AI](https://verbatra.kreitz-webdev.de/docs/start-with-ai) is a prompt that walks an agent through a safe first setup, stopping for confirmation before anything spends.

## Documentation

**[verbatra.kreitz-webdev.de](https://verbatra.kreitz-webdev.de)** is the canonical reference: every command, every config key, every format, and every provider. Start with the [quickstart](https://verbatra.kreitz-webdev.de/docs/quickstart), the [CLI reference](https://verbatra.kreitz-webdev.de/docs/cli), or the [SDK reference](https://verbatra.kreitz-webdev.de/docs/sdk). At the terminal, `verbatra <command> --help` prints the same command reference.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md) first; to work on the code, run `pnpm install`, then `pnpm verify` reproduces the CI merge gate.

## Security

API keys are read only from environment variables, never from the config, a CLI argument, or a function argument, and error messages name the variable without ever including its value. verbatra has no telemetry, analytics, or update check; the only network requests go to the translation provider you configure. [Data handling and privacy](https://verbatra.kreitz-webdev.de/docs/data-handling) lists what each provider receives. To report a vulnerability, see [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) (c) Mario Kreitz. Third-party fonts, icons and dependencies keep their own licenses; [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) lists them for the documentation site.
