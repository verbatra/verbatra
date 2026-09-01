<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/verbatra/main/.github/assets/verbatra-mark.png" alt="verbatra logo, a glowing V mark on a dark square" width="96" height="96" />
</p>

<h1 align="center">@verbatra/cli</h1>

<p align="center">
  Command-line tool to automate i18n translation and keep your locale files in sync across languages, using OpenAI, Anthropic, Gemini, DeepL, Google Cloud Translation, or an openai-compatible local or self-hosted model.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@verbatra/cli"><img src="https://img.shields.io/npm/v/@verbatra/cli?label=%40verbatra%2Fcli" alt="@verbatra/cli npm version" /></a>
  <a href="https://github.com/verbatra/verbatra/actions/workflows/ci.yml"><img src="https://github.com/verbatra/verbatra/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://codecov.io/gh/verbatra/verbatra"><img src="https://codecov.io/gh/verbatra/verbatra/graph/badge.svg" alt="Coverage" /></a>
  <a href="https://github.com/verbatra/verbatra/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
</p>

## Description

`@verbatra/cli` provides the `verbatra` command: scaffold a config, translate every target locale, watch your source and re-translate as it changes, check or diff your locales without writing, validate the whole project setup before you spend anything, export and import a translator handoff for manual translation, or open Verbatra Studio, a local web dashboard over the project. It is a thin wrapper over [`@verbatra/sdk`](https://github.com/verbatra/verbatra/tree/main/packages/sdk).

## Requirements

Node.js `>=22.14.0`.

## Installation

```bash
npm install --save-dev @verbatra/cli
# pnpm
pnpm add -D @verbatra/cli
# yarn
yarn add -D @verbatra/cli
```

A dev-dependency install puts the `verbatra` binary in `node_modules/.bin`, not on your PATH, so invoke it with `npx verbatra ...`, which runs the locally installed binary whichever package manager put it there. Yarn users can also run `yarn verbatra ...`.

Want to try a command before installing? Use the scoped package name: `npx @verbatra/cli --help` (or `pnpm dlx @verbatra/cli --help`).

## Quick start

```bash
# Scaffold verbatra.config.ts and .env.example
npx verbatra init --provider gemini

# Provide the provider's API key (see the table below for each provider's variable)
export GEMINI_API_KEY=your-key-here

# Translate every target locale once
npx verbatra translate

# Also remove orphaned keys (present in a target file, absent from source)
npx verbatra translate --prune
```

Gemini is shown because its API has a real free tier, so you can create a key at [Google AI Studio](https://aistudio.google.com/apikey) and try verbatra without setting up billing. `anthropic`, `openai`, `deepl`, and `google-translate` work the same way; only the key variable and the config's `provider` block differ.

Plural-category generation is opt-in too, but config/SDK only: set `generatePlurals: true` in the config. Unlike `--prune`, there is no `--generate-plurals` flag (the SDK `translate()` input accepts a per-run override).

## Commands

verbatra ships ten commands: `init` (scaffold a config), `translate` (translate every target locale once), `watch` (re-translate on every source change), `check` (report per-locale missing, stale, and up-to-date counts without writing), `diff` (list the keys that would be added, re-translated, or are orphaned per locale, without writing), `doctor` (validate the project setup and report every problem at once), `export` (write untranslated strings to a translator handoff), `import` (read the filled handoff back, with the same safety checks as `translate`), `studio` (start the local Verbatra Studio dashboard), and `mcp` (start a stdio MCP server exposing verbatra's tools to an MCP client). `check`, `diff`, and `doctor` are read-only: they call no provider and write no file, so they suit CI gates. `export` and `import` are the manual-translation workflow, for the strings you want a human to translate. Both take `--format`, which picks the handoff shape: `xlsx` (the default) writes one styled Excel workbook with a sheet per locale, while `csv` and `tsv` write one plain `<locale>.csv` or `<locale>.tsv` per locale into a directory, which is easier to diff and review. The full reference - every flag, examples, and the exit-code contract - lives on the documentation site:

- [CLI reference](https://verbatra.kreitz-webdev.de/docs/cli)
- [`verbatra init`](https://verbatra.kreitz-webdev.de/docs/cli/init)
- [`verbatra translate`](https://verbatra.kreitz-webdev.de/docs/cli/translate)
- [`verbatra watch`](https://verbatra.kreitz-webdev.de/docs/cli/watch)
- [`verbatra check`](https://verbatra.kreitz-webdev.de/docs/cli/check)
- [`verbatra diff`](https://verbatra.kreitz-webdev.de/docs/cli/diff)
- [`verbatra doctor`](https://verbatra.kreitz-webdev.de/docs/cli/doctor)
- [`verbatra export`](https://verbatra.kreitz-webdev.de/docs/cli/export)
- [`verbatra import`](https://verbatra.kreitz-webdev.de/docs/cli/import)
- [`verbatra studio`](https://verbatra.kreitz-webdev.de/docs/cli/studio)
- [`verbatra mcp`](https://verbatra.kreitz-webdev.de/docs/cli/mcp)
- [Manual translation workflow](https://verbatra.kreitz-webdev.de/docs/manual-translation)

Run `verbatra <command> --help` for the same reference at the terminal.

## Verbatra Studio

`verbatra studio` serves a local dashboard over the project: translation status and diff, a needs-review queue with in-place editing, a locale-file activity feed with the last run's token usage, and the resolved config with a file-backed glossary you can edit in place, refreshed live as your locale files change. Local editing is always on and runs through the same integrity gate a translate run applies to every candidate value; actions that spend provider budget (retranslate, translate pending) exist only with `--allow-spend` or `VERBATRA_STUDIO_ALLOW_SPEND`. `--expose-agent-tools` (or `VERBATRA_STUDIO_AGENT_TOOLS`) additionally registers Studio's RPC methods as WebMCP agent tools in the browser; it is off by default and confers no authority the open, authenticated tab does not already hold. The server binds to `127.0.0.1` only and gates every request behind a Host and Origin check, the bootstrap token from the printed URL, and a session cookie. The dashboard itself ships as [`@verbatra/studio`](https://github.com/verbatra/verbatra/tree/main/packages/studio); install it alongside the CLI:

```bash
npm install --save-dev @verbatra/cli @verbatra/studio
npx verbatra studio
```

## Exit codes

The CLI returns codes you can branch on in CI and scripts:

| Code | Meaning |
| --- | --- |
| `0` | Success (also `--help` and `--version`); for `check` and `diff`, every locale is in sync, and for `doctor`, every check passed. |
| `1` | `translate` or `import` finished, but at least one locale failed or came out partial (a partial locale is one whose file was written with some keys still missing); for `check` and `diff`, at least one locale is out of sync; for `doctor`, at least one check failed. |
| `2` | Could not run: a whole-run error or a usage error. |
| `130` | `watch` or `studio` was force-stopped by a second interrupt. A single interrupt stops gracefully and exits `0`; if the shutdown itself fails, `watch` exits `2` and `studio` exits `1`. |

A `watch` per-run failure is reported as an output record, not an exit code. `doctor` reads a broken config the other way around from the row for `2`: a config it cannot find by search, or one that fails validation, is a failed check and exit `1`, and it exits `2` only when it cannot run at all, such as an explicit `--config` path that does not exist.

## API keys

Keys are read only from the environment, never from the config. Each provider reads one variable:

| Provider id | Environment variable |
| --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `gemini` | `GEMINI_API_KEY` |
| `deepl` | `DEEPL_API_KEY` |
| `google-translate` | `GOOGLE_TRANSLATE_API_KEY` |

`openai-compatible` is not in this table: most local servers need no key at all, and when one is required it comes from `OPENAI_COMPATIBLE_API_KEY` or from whichever variable the provider's `apiKeyEnvVar` option names. See the [Providers page](https://verbatra.kreitz-webdev.de/docs/providers) for its key resolution.

`verbatra init` writes a `.env.example` and makes sure your `.gitignore` covers the paths a verbatra project keeps out of version control: `.env` and `.env.local` for your keys, plus `.verbatra-local/` and `verbatra.cache.json` for the local, regenerable state a run produces. `translate`, `watch`, and `import` silently top up an existing `.gitignore` with any of those entries it is missing, so a project scaffolded before an entry existed still gets it; none of them creates a `.gitignore` that is not already there, and a failure to write one never fails the run. `translate`, `watch`, `studio`, and `doctor` load `.env.local` and then `.env` from the working directory before running; a variable already set in the real environment always wins.

## Configuration

verbatra is configured with a `verbatra.config.ts`, a `.verbatrarc.json`, or a `"verbatra"` key in `package.json`. Run `verbatra init` to scaffold one. For the full configuration schema and a worked example, see the [`@verbatra/sdk` README](https://github.com/verbatra/verbatra/tree/main/packages/sdk) and the [project README](https://github.com/verbatra/verbatra).

## Documentation

- [Documentation site](https://verbatra.kreitz-webdev.de)
- [Project README](https://github.com/verbatra/verbatra)
- [`@verbatra/sdk`](https://github.com/verbatra/verbatra/tree/main/packages/sdk) for the programmatic API
- `verbatra <command> --help` for the command reference at the terminal

## License

[MIT](https://github.com/verbatra/verbatra/blob/main/LICENSE) (c) Mario Kreitz
