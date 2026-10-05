<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/verbatra/main/.github/assets/verbatra-mark.png" alt="verbatra logo, a glowing V mark on a dark square" width="96" height="96" />
</p>

<h1 align="center">@verbatra/studio</h1>

<p align="center">
  Local Verbatra Studio dashboard: a live web view over a verbatra project with built-in local editing, served from a prebuilt single-page app.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@verbatra/studio"><img src="https://img.shields.io/npm/v/%40verbatra%2Fstudio?label=%40verbatra%2Fstudio&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="@verbatra/studio npm version" /></a>
  <a href="https://github.com/verbatra/verbatra/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/verbatra/verbatra/ci.yml?branch=main&amp;label=CI&amp;labelColor=0b0b12" alt="CI status on main" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/verbatra/verbatra"><img src="https://img.shields.io/ossf-scorecard/github.com/verbatra/verbatra?label=openssf%20scorecard&amp;labelColor=0b0b12" alt="OpenSSF Scorecard" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/studio#provenance"><img src="https://img.shields.io/badge/npm%20provenance-SLSA%20v1-7b1fa2?labelColor=0b0b12" alt="npm provenance: SLSA v1 build attestation" /></a>
  <a href="https://github.com/verbatra/verbatra/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?color=7b1fa2&amp;labelColor=0b0b12" alt="License: MIT" /></a>
</p>

## Description

`@verbatra/studio` is the dashboard behind the `verbatra studio` command: a prebuilt single-page app served by a small loopback HTTP server, showing your project's translation state live. You install it as a dev dependency next to [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli); the CLI loads it on demand, so its absence never breaks the rest of the CLI.

## Requirements

Node.js `>=22.14.0`.

## Installation

```bash
npm install --save-dev @verbatra/cli @verbatra/studio
# pnpm
pnpm add --save-dev @verbatra/cli @verbatra/studio
# yarn
yarn add --dev @verbatra/cli @verbatra/studio
# bun
bun add --dev @verbatra/cli @verbatra/studio
```

## Quick start

```bash
npx verbatra studio
# Verbatra Studio running at http://127.0.0.1:5849/?token=...
```

Open the printed URL; the token is required. Add `--verbose` to also print one stderr line per request, with the token masked.

<img src="https://raw.githubusercontent.com/verbatra/verbatra/main/apps/docs/public/screenshots/studio-translations-dark.webp" alt="The Translations page of Verbatra Studio in its dark theme, listing per-locale translation status beside a per-key detail view" width="100%" />

## What it serves

- **Translations**: per-locale status, the diff, and lock drift, filterable by state, locale, review queue entries, and integrity problems, down to a per-key detail view with the source value, its source file description, every target's current translation, and who wrote it.
- **Review**: every translation a provider, the translation memory, or an agent wrote that nobody has approved yet, read from the committed files so the whole team sees the same queue, filterable by locale, origin, and review state, and worked from the keyboard, in bulk, or a whole locale at once: approve, reject, or edit an entry side by side with its source, context, glossary terms, and integrity check. Approve and Reject decisions are saved to `verbatra.provenance.json`, which `verbatra check --require-reviewed` gates on.
- **Activity**: the git commit history of the source and target locale files, plus the last run's token usage and budget.
- **Settings**: the resolved config, the glossary, and the session's capabilities. A glossary the project keeps in a JSON file is editable here, with the new state shown as soon as the write lands.

Every page refreshes live over a server-sent event stream as your locale files change. The config and its glossary are loaded once at startup, so a config change needs a restart. A glossary edit, from Settings or on disk, shows at once in Settings and in a key's glossary hits, but translating pending changes, retranslating, and the cost estimate use it only after a restart; integrity checks and the edit gate never read the glossary. Studio follows its own theme preference, independently of any site you opened it from.

## Editing and provider spend

Local editing is always on, and none of it calls a provider. An edit runs through the same integrity gate a translate run applies to every candidate value, then writes the locale file and the lock. An approval changes no translation, so it runs no gate: it records the decision in `verbatra.provenance.json` and writes nothing else. A rejection removes the translation from the locale file and drops its lock entry, so the key reads as missing until a translate run or a person fills it again, and records the decision in `verbatra.provenance.json`. Editing the glossary from Settings is local editing too, since changing a term calls no provider and spends nothing; the server derives the target file from the loaded config alone and never accepts a path for it, and a glossary written inline in the config module keeps the panel read-only.

Actions that spend provider budget, retranslating one key or a selection and translating every pending change, exist only when Studio is started with `--allow-spend` or with `VERBATRA_STUDIO_ALLOW_SPEND` set. Without that flag those methods are not registered on the server at all, so Studio never calls a provider.

`--expose-agent-tools` (or `VERBATRA_STUDIO_AGENT_TOOLS`) additionally registers Studio's RPC methods as WebMCP tools on the browser's `document.modelContext`, so a browser agent can drive the same surface. It is off by default. The bulk review methods (approving or rejecting a selection, approving a whole locale, retranslating a selection) and the in-flight query stay with the person at the dashboard and never become tools. Each tool is a 1:1 wrapper over the same authenticated call the dashboard makes, travelling the same validation and the same capability gate, so it confers no authority the open, authenticated tab does not already hold: the two spend tools register only when spending is granted, and a config with `provider: { id: "none" }` withholds them even with `--allow-spend`.

## Security model

- The server binds to `127.0.0.1` only; it is never reachable from the network.
- The `Host` header must be exactly the bound `127.0.0.1:PORT`, and a present `Origin` on a state-changing request must match it.
- The printed URL's bootstrap token is accepted only as `?token=` on the root `GET`, where it sets an HttpOnly, `SameSite=Strict` session cookie and redirects to `/`; every later request, including `POST /rpc`, authenticates on that cookie. The token is not single-use: visiting the URL again sets the cookie again, so keep the URL private while Studio runs.
- The write and spend RPC methods are additionally rate limited per process.
- API keys are read only from environment variables, never from the config, and never reach the browser.

## Programmatic use

The package's entry point is `startStudioServer`, which binds the server to `127.0.0.1` and serves the SPA from the built assets. Alongside it the package exports the `DEFAULT_STUDIO_PORT` constant, the structured `StudioServerStartError` with its error-code type, and the supporting types its options, deps, and injection seams are written in. The CLI's `studio` command is the intended consumer; most projects never call it directly.

## Development

Working on this package inside the [verbatra monorepo](https://github.com/verbatra/verbatra): `src/server/` is the server, `src/app/` the React SPA that Vite builds into `dist/app`, `src/shared/` the RPC contract and SSE event names both sides compile against, and `src/webmcp/` the WebMCP adapter. `pnpm build` runs `tsup && vite build` in that order, because tsup cleans `dist/` and would otherwise delete the SPA output.

The dev flow is same-origin, with no proxy and no hot module reloading: run `pnpm dev:app` in one terminal to keep an unminified `vite build --watch` refreshing `dist/app`, and `pnpm dev:server` in a second to serve those built assets. Wait for the first build pass before opening the printed URL.

## Documentation

- [Documentation site](https://verbatra.kreitz-webdev.de)
- [`verbatra studio` reference](https://verbatra.kreitz-webdev.de/docs/cli/studio)
- [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli) for the command-line tool

## License

[MIT](https://github.com/verbatra/verbatra/blob/main/LICENSE) (c) Mario Kreitz
