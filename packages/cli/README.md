<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/verbatra/main/.github/assets/verbatra-mark.png" alt="verbatra logo, a glowing V mark on a dark square" width="96" height="96" />
</p>

<h1 align="center">@verbatra/cli</h1>

<p align="center">
  Command-line tool to automate i18n translation and keep your locale files in sync across languages, using OpenAI, Anthropic, Gemini, DeepL, Google Cloud Translation, or an openai-compatible local or self-hosted model.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@verbatra/cli"><img src="https://img.shields.io/npm/v/%40verbatra%2Fcli?label=%40verbatra%2Fcli&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="@verbatra/cli npm version" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/%40verbatra%2Fcli?color=7b1fa2&amp;labelColor=0b0b12" alt="Required Node.js version" /></a>
  <a href="https://github.com/verbatra/verbatra/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/verbatra/verbatra/ci.yml?branch=main&amp;label=CI&amp;labelColor=0b0b12" alt="CI status on main" /></a>
  <a href="https://github.com/verbatra/verbatra/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?color=7b1fa2&amp;labelColor=0b0b12" alt="License: MIT" /></a>
</p>

## Description

`@verbatra/cli` provides the `verbatra` command: scaffold a config, translate every target locale, watch your source and re-translate as it changes, check or diff your locales without writing, validate the whole project setup before you spend anything, hand strings off to a human translator and read them back, or open Verbatra Studio, the local dashboard over your project. Only genuinely new or changed strings are sent to a provider, and no candidate translation that breaks a placeholder ever reaches your locale files. It is a thin wrapper over [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk), which holds all of the logic.

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

A dev-dependency install puts the `verbatra` binary in `node_modules/.bin`, not on your PATH, so invoke it with `npx verbatra ...`, which runs the locally installed binary whichever package manager put it there. To try a command before installing, use the scoped name: `npx @verbatra/cli --help`.

## Quick start

```bash
# Scaffold verbatra.config.ts and .env.example
npx verbatra init --provider gemini

# Provide the provider's API key
export GEMINI_API_KEY=your-key-here

# Translate every target locale once
npx verbatra translate
```

Gemini is shown because its API has a real free tier, so you can create a key at [Google AI Studio](https://aistudio.google.com/apikey) and try verbatra without setting up billing. `anthropic`, `openai`, `deepl`, and `google-translate` work the same way; only the key variable and the config's `provider` block differ.

## Commands

| Command | What it does |
| --- | --- |
| `verbatra init` | Create a verbatra config and .env example for this project |
| `verbatra extract` | Scan your source for translation call sites and add new keys to the source locale |
| `verbatra translate` | Translate every target locale once, then exit |
| `verbatra watch` | Re-translate on every source change until interrupted |
| `verbatra check` | Report which keys are missing or stale per locale without writing files |
| `verbatra diff` | Show the keys that would be added, re-translated, or orphaned per locale without writing files |
| `verbatra doctor` | Validate the project setup without calling a provider or reading an API key |
| `verbatra pseudo` | Generate a pseudolocale from the source strings without calling a provider |
| `verbatra types` | Generate TypeScript declarations for your catalog keys and message arguments |
| `verbatra export` | Export untranslated strings into a translator handoff (Excel workbook, CSV, or TSV) |
| `verbatra import` | Import a filled handoff back into the locale files, running the same safety checks |
| `verbatra tmx` | Import a TMX translation memory from another tool, or export this project's memory as TMX |
| `verbatra studio` | Start Verbatra Studio, the local translation dashboard |
| `verbatra mcp` | Start a stdio MCP server exposing verbatra's tools to an MCP client |

`check`, `diff`, and `doctor` are read-only: they call no provider, need no API key, and write no file, which is what makes them safe as CI gates and on fork pull requests. `pseudo` and `types` call no provider either.

Every flag, every example, and the exit-code contract live in the [CLI reference](https://verbatra.kreitz-webdev.de/docs/cli). `verbatra <command> --help` prints the same reference at the terminal.

## API keys

Keys are read only from the environment, never from the config, a CLI argument, or a function argument. Each provider reads one variable, named on the [Providers page](https://verbatra.kreitz-webdev.de/docs/providers) along with its options and model ids. `verbatra init` writes a `.env.example` and makes sure your `.gitignore` covers `.env`, `.env.local`, and the regenerable local state a run produces.

## Documentation

- [Documentation site](https://verbatra.kreitz-webdev.de)
- [CLI reference](https://verbatra.kreitz-webdev.de/docs/cli)
- [Configuration](https://verbatra.kreitz-webdev.de/docs/config-file)
- [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk) for the programmatic API

## License

[MIT](https://github.com/verbatra/verbatra/blob/main/LICENSE) (c) Mario Kreitz
