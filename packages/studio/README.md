<p align="center">
  <img src="https://raw.githubusercontent.com/verbatra/verbatra/main/.github/assets/verbatra-mark.png" alt="verbatra logo, a glowing V mark on a dark square" width="96" height="96" />
</p>

<h1 align="center">@verbatra/studio</h1>

<p align="center">
  Verbatra Studio: a local dashboard over your verbatra project, with live translation status, a review queue and built-in editing.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@verbatra/studio"><img src="https://img.shields.io/npm/v/%40verbatra%2Fstudio?label=%40verbatra%2Fstudio&amp;color=7b1fa2&amp;labelColor=0b0b12" alt="@verbatra/studio npm version" /></a>
  <a href="https://github.com/verbatra/verbatra/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/verbatra/verbatra/ci.yml?branch=main&amp;label=CI&amp;labelColor=0b0b12" alt="CI status on main" /></a>
  <a href="https://www.npmjs.com/package/@verbatra/studio#provenance"><img src="https://img.shields.io/badge/npm%20provenance-SLSA%20v1-7b1fa2?labelColor=0b0b12" alt="npm provenance: SLSA v1 build attestation" /></a>
  <a href="https://github.com/verbatra/verbatra/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?color=7b1fa2&amp;labelColor=0b0b12" alt="License: MIT" /></a>
</p>

<p align="center">
  <a href="https://verbatra.kreitz-webdev.de/docs/cli/studio">Documentation</a> |
  <a href="https://verbatra.kreitz-webdev.de/docs/review-in-studio">Review in Studio</a> |
  <a href="https://github.com/verbatra/verbatra/blob/main/packages/studio/CHANGELOG.md">Changelog</a> |
  <a href="https://github.com/verbatra/verbatra/issues">Issues</a>
</p>

## Description

`@verbatra/studio` is the dashboard behind the `verbatra studio` command: a prebuilt single-page app served by a small loopback HTTP server, showing your project's translation state live. You install it as a dev dependency next to [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli); the CLI loads it on demand, so its absence never breaks the rest of the CLI.

## Installation

```bash
npm install --save-dev @verbatra/cli @verbatra/studio
```

Needs Node.js `^22.18.0 || >=24`.

## Quick start

```bash
npx @verbatra/cli studio
```

The command prints `Verbatra Studio running at http://127.0.0.1:5849/?token=...`. Open that URL; the token is required. Add `--port <n>` to change the port, and `--verbose` to also print one stderr line per request, with the token masked.

<img src="https://raw.githubusercontent.com/verbatra/verbatra/main/apps/docs/public/screenshots/studio-translations-dark.webp" alt="The Translations page of Verbatra Studio in its dark theme, listing per-locale translation status beside a per-key detail view" width="100%" />

## What it serves

- **Translations**: per-locale status, the diff, and lock drift, filterable by state, locale, review queue entries, and integrity problems, down to a per-key detail view with the source value, every target's current translation, and who wrote it.
- **Review**: every machine-written translation nobody has approved yet, read from the committed files so the whole team sees the same queue. Approve, reject, or edit an entry side by side with its source, glossary terms, and integrity check, from the keyboard, in bulk, or a whole locale at once. Decisions are saved to `verbatra.provenance.json`, which `verbatra check --require-reviewed` gates on.
- **Activity**: the git commit history of the source and target locale files, plus the last run's token usage and budget.
- **Settings**: the resolved config, the glossary, and the session's capabilities. A glossary the project keeps in a JSON file is editable here.

Every page refreshes live as your locale files change. The config and its glossary are loaded once at startup, so a config change needs a restart. See [Review in Studio](https://verbatra.kreitz-webdev.de/docs/review-in-studio) for the review workflow.

## Editing and provider spend

Local editing is always on, and none of it calls a provider. An edit runs through the same integrity gate a translate run applies to every candidate value, then writes the locale file and the lock.

Actions that spend provider budget, retranslating one key or a selection and translating every pending change, exist only when Studio is started with `--allow-spend` or with `VERBATRA_STUDIO_ALLOW_SPEND` set. Without that flag those methods are not registered on the server at all, so Studio never calls a provider. A config with `provider: { id: "none" }` never offers them, even with the flag.

`--expose-agent-tools` (or `VERBATRA_STUDIO_AGENT_TOOLS`) additionally registers Studio's RPC methods as WebMCP tools on the browser's `document.modelContext`, so a browser agent can drive the same surface. It is off by default and confers no authority the open, authenticated tab does not already hold. See [Agent tools in Studio](https://verbatra.kreitz-webdev.de/docs/agent-tools-in-studio).

## Security model

- The server binds to `127.0.0.1` only; it is never reachable from the network.
- The `Host` header must be exactly the bound `127.0.0.1:PORT`, and a present `Origin` on a state-changing request must match it.
- The printed URL's bootstrap token is accepted only as `?token=` on the root `GET`, where it sets an HttpOnly, `SameSite=Strict` session cookie and redirects to `/`; every later request, including `POST /rpc`, authenticates on that cookie. The token is not single-use, so keep the URL private while Studio runs.
- The write and spend RPC methods are additionally rate limited per process.
- API keys are read only from environment variables, never from the config, and never reach the browser.

## Programmatic use

The entry point is `startStudioServer`, which binds the server to `127.0.0.1` and serves the SPA from the built assets. The package also exports `DEFAULT_STUDIO_PORT`, `StudioServerStartError` with its `StudioServerErrorCode` type, `isRequestLogLine` (which recognizes the per-request line `--verbose` prints), and the types its options, deps, and injection seams are written in. The CLI's `studio` command is the intended consumer; most projects never call it directly.

## Development

Working on this package inside the [verbatra monorepo](https://github.com/verbatra/verbatra): `src/server/` is the server, `src/app/` the React SPA that Vite builds into `dist/app`, `src/shared/` the RPC contract and SSE event names both sides compile against, and `src/webmcp/` the WebMCP adapter. `pnpm build` runs `tsup && vite build` in that order, because tsup cleans `dist/` and would otherwise delete the SPA output. For the dev flow, run `pnpm dev:app` in one terminal to keep an unminified `vite build --watch` refreshing `dist/app`, and `pnpm dev:server` in a second to serve those built assets; there is no hot module reloading, so wait for the first build pass before opening the printed URL.

## Documentation

- [`verbatra studio` reference](https://verbatra.kreitz-webdev.de/docs/cli/studio)
- [Review in Studio](https://verbatra.kreitz-webdev.de/docs/review-in-studio)
- [Agent tools in Studio](https://verbatra.kreitz-webdev.de/docs/agent-tools-in-studio)

## Related packages

- [`@verbatra/cli`](https://www.npmjs.com/package/@verbatra/cli): the `verbatra` command that starts Studio.
- [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk): the engine Studio is a thin surface over.
- [`@verbatra/mcp`](https://www.npmjs.com/package/@verbatra/mcp): the same capabilities for coding agents, without a browser.

## Contributing

See [CONTRIBUTING.md](https://github.com/verbatra/verbatra/blob/main/CONTRIBUTING.md).

## License

[MIT](https://github.com/verbatra/verbatra/blob/main/LICENSE) (c) Mario Kreitz
