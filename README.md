<p align="center">
  <img src=".github/assets/banner.webp" alt="verbatra: automated i18n translation for modern applications" />
</p>

<h1 align="center">verbatra</h1>

<p align="center">
  Automate i18n translation and keep your locale files in sync across languages, using OpenAI, Anthropic, Gemini, DeepL, Google Cloud Translation, or an openai-compatible local or self-hosted model.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@verbatra/cli"><img src="https://img.shields.io/npm/v/@verbatra/cli?label=%40verbatra%2Fcli" alt="@verbatra/cli npm version" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/sdk"><img src="https://img.shields.io/npm/v/@verbatra/sdk?label=%40verbatra%2Fsdk" alt="@verbatra/sdk npm version" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/cli"><img src="https://img.shields.io/npm/dm/@verbatra/cli?label=downloads%2Fmonth" alt="Monthly npm downloads" /></a>
  <a href="https://github.com/verbatra/verbatra/actions/workflows/ci.yml"><img src="https://github.com/verbatra/verbatra/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://codecov.io/gh/verbatra/verbatra"><img src="https://codecov.io/gh/verbatra/verbatra/graph/badge.svg" alt="Coverage" /></a>
  <a href="https://coderabbit.ai"><img src="https://img.shields.io/coderabbit/prs/github/verbatra/verbatra?utm_source=oss&amp;utm_medium=github&amp;utm_campaign=verbatra%2Fverbatra&amp;labelColor=171717&amp;color=FF570A&amp;label=CodeRabbit%20reviews" alt="CodeRabbit pull request reviews" /></a>
  <a href="https://github.com/verbatra/action/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/verbatra/action/ci.yml?branch=main&amp;label=Action%20CI" alt="verbatra-action CI" /></a>
  <a href="https://github.com/marketplace/actions/verbatra"><img src="https://img.shields.io/github/v/release/verbatra/action?sort=semver&amp;label=marketplace&amp;color=blue" alt="verbatra action on GitHub Marketplace" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
</p>

## Quick start

Needs Node.js `>=22.14.0`. verbatra installs as a development dependency, which puts the `verbatra` binary in `node_modules/.bin` rather than on your PATH, so the commands below call it through `npx`:

```bash
# 1. Install as a dev dependency
npm install --save-dev @verbatra/cli

# 2. Scaffold verbatra.config.ts and .env.example (choose your provider)
npx verbatra init --provider gemini

# 3. Provide the provider's API key. init created .env.example and gitignored
#    .env, so you can set it in .env, or export it (Gemini shown):
export GEMINI_API_KEY=your-key-here

# 4. Translate every target locale once
npx verbatra translate
```

Gemini is the cheapest way to try verbatra: its API has a real free tier, so you can create a key at [Google AI Studio](https://aistudio.google.com/apikey) without setting up billing. Pass `anthropic`, `openai`, `deepl`, or `google-translate` to `--provider` instead if you prefer one of those; switching later means editing one `id` in your config.

`npx` runs the locally installed binary whichever package manager put it there, so `yarn add -D @verbatra/cli` covers step 1 just as well, and yarn users can also run `yarn verbatra ...`.

Want to try a command before installing? Use the scoped package name: `npx @verbatra/cli --help` (or `pnpm dlx @verbatra/cli --help`).

pnpm needs one extra step. `pnpm add -D @verbatra/cli` installs correctly but exits `1` with `ERR_PNPM_IGNORED_BUILDS`, because pnpm does not run the install scripts of third-party dependencies (here the Gemini SDK and its `protobufjs`) until you allow or decline them, and it leaves an unanswered `pnpm-workspace.yaml` behind that makes every later pnpm command in the project fail the same way. Answer it once with `pnpm approve-builds`, or put this in `pnpm-workspace.yaml` before installing:

```yaml
allowBuilds:
  '@google/genai': false
  protobufjs: false
```

verbatra does not need those scripts; this repository declines both. See [Troubleshooting](https://verbatra.kreitz-webdev.de/docs/troubleshooting) for the full message and fix.

## Description

verbatra translates your application's locale files for you. You maintain the source locale by hand, and as strings are added or change, verbatra fills in every target locale through the AI or machine-translation provider you choose. It records what it has already translated, so each run touches only what actually changed.

It ships in four packages. `@verbatra/cli` gives you a `verbatra` command for the terminal and CI, `@verbatra/sdk` is the same engine as a programmatic API, `@verbatra/studio` is a local web dashboard served through the `verbatra studio` command, and `@verbatra/mcp` is a stdio MCP server exposing translation status, glossary, and editing tools to MCP clients such as Claude Desktop, Claude Code, or Cursor, served through the `verbatra mcp` command. verbatra is built SDK-first: the CLI is a thin wrapper over the SDK, so anything the command line does, you can also do in code.

## Features

- **Many locale formats.** JSON for i18next, vue-i18n, next-intl, and ngx-translate, plus XLIFF, YAML, Flutter ARB, Java/Spring properties, Apple `.strings`/`.stringsdict`, Xcode String Catalogs (`.xcstrings`), Android `strings.xml`, and gettext `.po`/`.pot` ([Formats](https://verbatra.kreitz-webdev.de/docs/formats)).
- **Six providers behind one interface.** Anthropic, OpenAI, Gemini, and openai-compatible (a local or self-hosted server such as LM Studio, Ollama, or vLLM) as LLMs, plus DeepL and Google Cloud Translation (machine translation) ([Providers](https://verbatra.kreitz-webdev.de/docs/providers)).
- **Incremental by default.** A lock file records what has been translated, so each run sends only new or changed strings to the provider.
- **Project scaffolding.** `verbatra init` writes a config and a `.env.example` for your project, and gitignores the local files it must not commit.
- **Dry runs.** `--dry-run` previews what would change without calling a provider or writing files.
- **Read-only status and diff.** `verbatra check` counts per-locale missing, stale, and up-to-date keys and `verbatra diff` names the keys that would be added, re-translated, or are orphaned; both write nothing and exit non-zero when a locale has a missing or stale key (orphaned keys alone never do), so they slot into CI ([CLI reference](https://verbatra.kreitz-webdev.de/docs/cli)).
- **Setup preflight.** `verbatra doctor` validates the config, the format adapter, the provider, its API key environment variable, and the source locale file in one pass and reports every problem at once, without calling a provider, writing a file, or reading a key value ([verbatra doctor](https://verbatra.kreitz-webdev.de/docs/cli/doctor)).
- **Watch mode.** `verbatra watch` re-translates automatically on every source change.
- **Manual translation.** `verbatra export` writes the strings that need translating to a translator handoff and `verbatra import` reads the filled handoff back with the same safety checks as an automated run. `--format` chooses the shape: a styled Excel workbook (`xlsx`, the default), or one plain `<locale>.csv` or `<locale>.tsv` per locale for a handoff you want to diff and review ([Manual translation](https://verbatra.kreitz-webdev.de/docs/manual-translation)).
- **Integrity gate on every translation.** Every candidate value is re-checked from the value itself at the single accept/reject point every write path calls (a provider result, a workbook import, a manual edit, and any translation reused for another key, whether from the cache or from grouping keys that share source content), and one that fails a check, a dropped or altered placeholder for example, is withheld and reported rather than written.
- **Lossless key round-trip.** Literal dotted leaf keys (such as `"foo.bar"` used as a single leaf) and real nested paths each keep their on-disk shape, and a file that expresses the same effective path both ways errors with `INVALID_STRUCTURE` rather than guessing or corrupting data ([Formats](https://verbatra.kreitz-webdev.de/docs/formats)).
- **Document key order preserved.** JSON-family, YAML, and ARB files round-trip in exact document key order (integer-like keys keep their position, new keys append in source-document order), and a YAML composite key (a map or sequence used as a mapping key) fails with a structured error instead of being silently mangled.
- **Opt-in cleanup and plural generation.** Orphan pruning (`--prune` / `prune`) and CLDR plural-category generation (`generatePlurals`) are off by default ([Configuration](https://verbatra.kreitz-webdev.de/docs/config-file)).
- **Keys stay in your environment.** API keys are read only from environment variables, never from the config.

## Configuration

verbatra looks for its configuration upward from the working directory: a `verbatra.config.ts`, a `.verbatrarc.json` (and the other `.verbatrarc.*` variants), or a `"verbatra"` key in `package.json`. The quickest way to get a valid one is `verbatra init`. A minimal `verbatra.config.ts`:

```ts
import { defineConfig } from "@verbatra/sdk";

export default defineConfig({
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  format: "i18next-json",
  files: {
    pattern: "locales/{locale}.json",
  },
  provider: {
    id: "gemini",
    options: {
      model: "gemini-2.5-flash", // replace with your provider's model id
      maxOutputTokens: 4096,
    },
  },
});
```

`files.pattern` must contain the `{locale}` token, and `targetLocales` must neither include `sourceLocale` nor list the same locale twice (compared case-insensitively). The supported `format` values are `i18next-json`, `vue-i18n-json`, `next-intl-json`, `ngx-translate-json`, `xliff`, `yaml`, `arb`, `properties`, `apple-strings`, `apple-xcstrings`, `android-xml`, and `gettext-po`. The optional `glossary` (a term map, given inline or as a path to a JSON file of the same shape) and `tone` (`"formal"`, `"informal"`, or `"neutral"`) refine the output.

The `provider` block is selected by `id`. The LLM providers take a `model` and a token limit; DeepL and Google Cloud Translation need no model:

```ts
// Anthropic (this provider's output-token limit option is maxTokens)
provider: { id: "anthropic", options: { model: "claude-sonnet-4-6", maxTokens: 4096 } }

// OpenAI
provider: { id: "openai", options: { model: "gpt-5.4-mini", maxOutputTokens: 4096 } }

// DeepL (machine translation)
provider: { id: "deepl", options: {} }

// Google Cloud Translation (machine translation, Basic v2)
provider: { id: "google-translate", options: {} }
```

Each provider reads its API key from one environment variable:

| Provider id | Environment variable |
| --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |
| `gemini` | `GEMINI_API_KEY` |
| `deepl` | `DEEPL_API_KEY` |
| `google-translate` | `GOOGLE_TRANSLATE_API_KEY` |

`openai-compatible` is not in this table: most local servers need no key at all, and when one is required it comes from `OPENAI_COMPATIBLE_API_KEY`, or from whichever variable the provider's `apiKeyEnvVar` option names. See the [Providers page](https://verbatra.kreitz-webdev.de/docs/providers) for its key resolution.

A `verbatra.config.ts` is typed by `defineConfig`, and a JSON or YAML config gets the same help from the JSON Schema document `@verbatra/sdk` ships at `@verbatra/sdk/config-schema.json`, generated at build time from the schema the SDK actually validates with. Point an editor at it, either with an in-file `$schema` key or an editor mapping, and a `.verbatrarc.json` or YAML config gets key completion and validation as you type. The config accepts an optional top-level `$schema` key for exactly this reason; it is ignored at runtime and is the only extra key the strict schema tolerates ([Configuration](https://verbatra.kreitz-webdev.de/docs/config-file)).

## Commands

| Command | What it does | Common flags |
| --- | --- | --- |
| `verbatra init` | Create a verbatra config and .env example for this project | `--provider <id>`, `--source`, `--targets`, `--path`, `--cwd`, `--yes`, `--force` |
| `verbatra translate` | Translate every target locale once, then exit | `--cwd`, `--config`, `--locales`, `--dry-run`, `--prune`, `--lock-timeout <seconds>`, `--concurrency <n>`, `--no-cache`, `--json` |
| `verbatra watch` | Re-translate on every source change until interrupted | `--cwd`, `--config`, `--locales`, `--debounce <ms>`, `--lock-timeout <seconds>`, `--concurrency <n>`, `--no-cache`, `--json` |
| `verbatra check` | Report per-locale missing, stale, and up-to-date counts without writing (read-only) | `--cwd`, `--config`, `--locales`, `--json` |
| `verbatra diff` | List the keys per locale that would be added, re-translated, or are orphaned, without writing (read-only) | `--cwd`, `--config`, `--locales`, `--json` |
| `verbatra doctor` | Validate the project setup and report every problem at once, without calling a provider or reading a key value (read-only) | `--cwd`, `--config`, `--json` |
| `verbatra export` | Export untranslated strings into a translator handoff: a styled Excel workbook, or one CSV or TSV file per locale | `--out`, `--locales`, `--include-unchanged`, `--format <xlsx\|csv\|tsv>`, `--cwd`, `--config`, `--json` |
| `verbatra import <workbook>` | Import a filled handoff back into the locale files, with the same safety checks (the argument is a workbook file, one CSV or TSV file, or the directory holding them) | `--dry-run`, `--format <xlsx\|csv\|tsv>`, `--cwd`, `--config`, `--json` |
| `verbatra studio` | Start Verbatra Studio, a local web dashboard over the project | `--port`, `--allow-spend`, `--expose-agent-tools`, `--cwd`, `--config` |
| `verbatra mcp` | Start a stdio MCP server exposing verbatra's tools to an MCP client | `--allow-spend`, `--cwd`, `--config` |

Run `verbatra <command> --help` for the full option list. The complete command reference - every flag and examples - lives on the [documentation site](https://verbatra.kreitz-webdev.de/docs/cli).

## Exit codes

Every command follows the same contract, so a CI step can branch on the code alone:

| Code | Meaning |
| --- | --- |
| `0` | Success: `translate` or `import` succeeded for every locale, `check` found every locale in sync, `diff` found no pending changes, `doctor` found no setup problem, `export` wrote its handoff, `init` scaffolded the project, `watch` or `studio` stopped cleanly, or `--help` or `--version` was printed |
| `1` | It ran, but the result is not clean: `translate` or `import` finished with at least one failed or partial locale (a partial locale is one whose file was written with some keys still missing), `check` found drift, `diff` found a missing or changed key (orphaned keys alone never produce `1`), `doctor` found at least one failed check, or `studio` failed while shutting its server down |
| `2` | Could not run: a whole-run error, a usage error, `init` without a resolvable provider or unable to scaffold a valid config, `watch` failing to start or to stop, or `studio` given a bad `--port` or unable to load the config, import `@verbatra/studio`, or start its server |
| `130` | `watch` or `studio` was force-stopped by a second interrupt |

A single interrupt is a clean stop and exits `0` for both `watch` and `studio`, but the two part ways if that stop itself fails: `watch` exits `2`, `studio` exits `1`. `export` has no per-locale failure mode, so it never exits `1`. `doctor` reads a broken config the other way around: a config it cannot find by search, or one that fails validation, is a failed check and exit `1`, and it exits `2` only when it cannot run at all, such as an explicit `--config` path that does not exist. One case sits outside the contract: a parse failure that is not a usage error is re-thrown and the binary does not catch it, so Node's default handling of an unhandled rejection applies instead of any of these codes.

## Verbatra Studio

`verbatra studio` starts Verbatra Studio, a local web dashboard over your project with four pages: Translations (per-locale status, the diff, and lock drift, down to a per-key detail view), Review (the needs-review queue, where you can edit a translation in place), Activity (a live feed of locale-file changes and the last run's token usage and budget), and Settings (your resolved config, glossary, and the session's capabilities, with a file-backed glossary editable in place). Every page refreshes live over a server-sent event stream as your locale files change.

Local editing is always on: an edit from the Review queue goes through the same integrity gate as a translate run, then writes the locale file and the lock, and a file-backed glossary can be edited from Settings the same way. Actions that spend provider budget (retranslating a key, translating pending changes) exist only when you start Studio with `--allow-spend` or set `VERBATRA_STUDIO_ALLOW_SPEND`; without that flag, Studio never calls a provider. The server binds to `127.0.0.1` only, and every request must carry the exact `127.0.0.1:PORT` `Host` header, match `Origin` when it changes state, and authenticate: the printed URL's bootstrap token is redeemed once to mint an HttpOnly, `SameSite=Strict` session cookie that every later request uses.

```bash
npx verbatra studio
# Verbatra Studio running at http://127.0.0.1:5849/?token=...
```

Studio ships as its own package; install both as dev dependencies:

```bash
npm install --save-dev @verbatra/cli @verbatra/studio
```

See the [Verbatra Studio docs](https://verbatra.kreitz-webdev.de/docs/cli/studio) for the full command reference and security model.

## GitHub Action

A composite GitHub Action runs `verbatra translate --json` in CI, turns each failed locale into an error annotation, writes a job summary table, and exits with the CLI's own exit code. It lives in its own repository, [verbatra/action](https://github.com/verbatra/action), and is consumed with `uses:` rather than installed from npm.

```yaml
- uses: actions/checkout@<commit-sha>
- uses: verbatra/action@<commit-sha>
  with:
    version: 0.9.0 # pin @verbatra/cli to an exact version
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

The action fetches and runs `@verbatra/cli` at exactly the version you pin, so the job needs no separate install step, and it rejects anything that is not an exact semver version so a run can never silently resolve `latest`. The API key comes from the environment as it does everywhere else in verbatra; there is no key input. Its `command` input selects `translate` (the default), `check`, or `diff`, so the read-only gate runs in the action too: `check` and `diff` call no provider and need no API key, which makes them safe on a fork pull request. Run the CLI directly when you want a flag the action does not expose, such as `--prune`.

See the [GitHub Action page](https://verbatra.kreitz-webdev.de/docs/github-action) for the full input list, the annotation and job-summary format, and the security notes.

## Programmatic use

Everything the CLI does is available from `@verbatra/sdk`:

```ts
import { loadConfig, translate } from "@verbatra/sdk";

// Discovers and validates verbatra.config.ts (or .verbatrarc.json, or a package.json "verbatra" key).
const config = await loadConfig();

// The provider reads its API key from the environment (e.g. GEMINI_API_KEY). No key is passed.
const summary = await translate({ config });

console.log(
  `${summary.succeeded.length} locale(s) fully translated, ${summary.partial.length} partial, ${summary.failed.length} failed`,
);
```

The manual-translation workflow is available too, with `exportWorkbook` and `importWorkbook`:

```ts
import { exportWorkbook, importWorkbook, loadConfig } from "@verbatra/sdk";

const config = await loadConfig();

// Export the strings that need translating to an Excel workbook.
const { path } = await exportWorkbook({ config });

// ...a human fills the Translation column, then import the file back.
const summary = await importWorkbook({ config, workbook: path });
```

See the [`@verbatra/sdk` README](./packages/sdk/README.md) for the full API.

## Packages

| Package | Description |
| --- | --- |
| [`@verbatra/cli`](./packages/cli/README.md) | The `verbatra` command-line tool. |
| [`@verbatra/sdk`](./packages/sdk/README.md) | The programmatic API. |
| [`@verbatra/studio`](./packages/studio/README.md) | The local Verbatra Studio dashboard, served through `verbatra studio`. |
| [`@verbatra/mcp`](./packages/mcp/README.md) | The stdio MCP server, served through `verbatra mcp`. |

The [GitHub Action](#github-action) is not in this table because it is not an npm package: it lives in its own repository and is consumed with `uses:`.

## Security

API keys are read only from environment variables, never from the config file. The config schema rejects unknown keys, so a key cannot hide there by accident, and `verbatra init` adds the local files a verbatra project must not commit, `.env` and `.env.local` among them, to your `.gitignore`. `translate`, `watch`, and `import` top up an existing `.gitignore` that is missing one of those entries. To report a vulnerability, see [SECURITY.md](./SECURITY.md).

## Documentation

The hosted documentation site at [verbatra.kreitz-webdev.de](https://verbatra.kreitz-webdev.de) is the canonical reference, including the full [CLI command reference](https://verbatra.kreitz-webdev.de/docs/cli). The [`@verbatra/sdk` README](./packages/sdk/README.md) documents the programmatic API. At the terminal, `verbatra <command> --help` prints the same command reference.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and our [Code of Conduct](./CODE_OF_CONDUCT.md) first.

Every pull request is reviewed automatically by [CodeRabbit](https://coderabbit.ai) alongside the CI checks, so you get feedback on your changes before a maintainer picks them up.

## License

[MIT](./LICENSE) (c) Mario Kreitz
