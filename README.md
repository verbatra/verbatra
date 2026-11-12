<p align="center">
  <a href="https://verbatra.kreitz-webdev.de"><img src=".github/assets/verbatra-mark.png" width="120" alt="verbatra logo" /></a>
</p>

<h1 align="center">verbatra</h1>

<p align="center">Automate i18n translation: only what changed gets translated, and nothing that breaks a placeholder gets written.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@verbatra/cli"><img src="https://img.shields.io/npm/v/%40verbatra%2Fcli?label=%40verbatra%2Fcli&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/cli"><img src="https://img.shields.io/npm/dm/%40verbatra%2Fcli?color=7b1fa2&amp;labelColor=0b0b12" alt="npm downloads per month" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/%40verbatra%2Fcli?color=7b1fa2&amp;labelColor=0b0b12" alt="License: MIT" /></a>
  <a href="https://github.com/verbatra/verbatra/actions/workflows/ci.yml"><img src="https://github.com/verbatra/verbatra/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status on main" /></a>
  <a href="https://codecov.io/gh/verbatra/verbatra"><img src="https://img.shields.io/codecov/c/github/verbatra/verbatra?labelColor=0b0b12" alt="Test coverage" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/verbatra/verbatra"><img src="https://img.shields.io/ossf-scorecard/github.com/verbatra/verbatra?label=openssf%20scorecard&amp;labelColor=0b0b12" alt="OpenSSF Scorecard" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/%40verbatra%2Fcli?color=7b1fa2&amp;labelColor=0b0b12" alt="Required Node.js version" /></a>
  <a href="https://verbatra.kreitz-webdev.de/docs"><img src="https://img.shields.io/badge/docs-verbatra.kreitz--webdev.de-7b1fa2?labelColor=0b0b12" alt="Documentation" /></a>
</p>

## Description

verbatra keeps your application's locale files translated. You edit the source locale; verbatra sends only new and changed strings to the AI or machine-translation provider you choose, checks every result, and writes the target locales in their own format and key order.

It reads and writes the [common i18n file formats](https://verbatra.kreitz-webdev.de/docs/formats) (i18next, vue-i18n, next-intl, ngx-translate, XLIFF, YAML, Flutter ARB, gettext, Android, Apple, .NET and more) and works with [LLM and machine-translation providers](https://verbatra.kreitz-webdev.de/docs/providers), or with none at all.

## Quick start

Needs Node.js `^22.22.0 || >=24`. Steps 1 to 3 need no account and no API key.

1. Install the CLI.

   ```bash
   npm install --save-dev @verbatra/cli
   ```

2. Have a source locale file. Skip this step if your project already has one.

   ```bash
   mkdir -p locales && echo '{ "greeting": "Hello, {{name}}!" }' > locales/en.json
   ```

3. Scaffold `verbatra.config.ts` and `.env.example`, then preview the run without a provider call or a write.

   ```bash
   npx @verbatra/cli init --format i18next-json --provider gemini --yes
   npx @verbatra/cli translate --dry-run
   ```

4. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` in it. Then translate, and confirm every locale is in sync (`check` exits `1` when one is not, so it can gate CI).

   ```bash
   npx @verbatra/cli translate
   npx @verbatra/cli check
   ```

Gemini has a free tier: create a key in [Google AI Studio](https://aistudio.google.com/apikey). The [quickstart](https://verbatra.kreitz-webdev.de/docs/quickstart) walks through each step, and [Pick your stack](https://verbatra.kreitz-webdev.de/docs/pick-your-stack) has the `--format` id for your framework.

## Why you can trust a run

- **Integrity gate.** A translation that drops a placeholder, breaks markup or ICU, or comes back empty is withheld and reported, never written. [Translation safety](https://verbatra.kreitz-webdev.de/docs/translation-safety)
- **Lock file and provenance.** `verbatra.lock.json` makes every run diff-driven, and `verbatra.provenance.json` records who or what wrote each value and whether a person reviewed it. [The lock file](https://verbatra.kreitz-webdev.de/docs/the-lock-file), [Provenance evidence](https://verbatra.kreitz-webdev.de/docs/provenance-evidence)
- **Keys from the environment only.** Never from the config, a CLI argument, or a function argument, and never printed. [Providers](https://verbatra.kreitz-webdev.de/docs/providers#keys-come-from-the-environment)
- **Human-only mode.** `provider: none` turns machine translation off by policy, and `export`/`import` hand strings to a translator through the same gate. [Human-only workflow](https://verbatra.kreitz-webdev.de/docs/human-only-workflow)
- **No telemetry.** The only network requests go to the provider you configure. [Data handling](https://verbatra.kreitz-webdev.de/docs/data-handling)

## Packages

| Package | What it is | Docs |
| --- | --- | --- |
| [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli) | The `verbatra` binary for your terminal and CI | [CLI reference](https://verbatra.kreitz-webdev.de/docs/cli) |
| [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk) | The same engine as a programmatic API; the CLI is a thin wrapper over it | [SDK reference](https://verbatra.kreitz-webdev.de/docs/sdk) |
| [`@verbatra/studio`](https://www.npmjs.com/package/@verbatra/studio) | Verbatra Studio, the local dashboard served by `verbatra studio` | [Studio](https://verbatra.kreitz-webdev.de/docs/cli/studio) |
| [`@verbatra/mcp`](https://www.npmjs.com/package/@verbatra/mcp) | A stdio MCP server that exposes verbatra to coding agents | [MCP server](https://verbatra.kreitz-webdev.de/docs/cli/mcp) |

Each package has its own README and changelog under [`packages/`](./packages). The private `core`, `format-adapters`, `ai-providers`, `exchange` and `extract` packages are bundled into `@verbatra/sdk` and are not published on their own.

## GitHub Action and agent skills

- **[verbatra/action](https://github.com/verbatra/action)** runs `translate`, `check` or `diff` in a workflow with `uses: verbatra/action@v1`. See [GitHub Action](https://verbatra.kreitz-webdev.de/docs/github-action).
- **[verbatra/skills](https://github.com/verbatra/skills)** teaches coding agents to drive the CLI, the MCP server and Studio. See [Connect an MCP client](https://verbatra.kreitz-webdev.de/docs/connect-an-mcp-client) and [Set up with an AI agent](https://verbatra.kreitz-webdev.de/docs/start-with-ai).

## Documentation

[verbatra.kreitz-webdev.de](https://verbatra.kreitz-webdev.de) is the reference for every command, config key, format and provider. Start with the [quickstart](https://verbatra.kreitz-webdev.de/docs/quickstart), then [How a run works](https://verbatra.kreitz-webdev.de/docs/how-it-works) and the [config file](https://verbatra.kreitz-webdev.de/docs/config-file). For agents, [llms.txt](https://verbatra.kreitz-webdev.de/llms.txt) indexes every page.

## Questions and issues

Ask questions in [GitHub Discussions](https://github.com/verbatra/verbatra/discussions). The [issue tracker](https://github.com/verbatra/verbatra/issues/new/choose) is for bug reports and feature requests; a bug report with a minimal reproduction gets fixed fastest.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md); `pnpm install` then `pnpm verify` reproduces the CI merge gate.

## Security

Report a vulnerability privately as described in [SECURITY.md](./SECURITY.md), never in a public issue.

## License

verbatra is [MIT licensed](./LICENSE). Third-party fonts, icons and dependencies keep their own licenses; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
