# @verbatra/format-adapters

> Private package. Not published. Its source is bundled into `@verbatra/sdk` by tsup
> (`WORKSPACE_INTERNALS` in `packages/sdk/tsup.config.ts`), so a change here ships inside the sdk's
> published bytes and needs a changeset naming `@verbatra/sdk`. Do not install this directly;
> install [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk).

## Purpose

Format adapters for verbatra: file formats to and from core's intermediate representation. One
interface, `FormatAdapter`, with one implementation per format, so the rest of the system never
learns what a `.xcstrings` catalog or a gettext `.po` header looks like. It depends on
`@verbatra/core` only.

## Responsibilities

- **Read and write every built-in format.** The adapters are registered in detection order by
  `createDefaultRegistry` (`src/default-registry.ts`), which is the closed list of supported
  formats; the [Formats page](https://verbatra.kreitz-webdev.de/docs/formats) names each one.
- **Preserve the file.** Document key order, line endings, comments, and format-specific metadata
  survive a round trip; a file that cannot be represented faithfully fails with a structured
  `AdapterError` rather than being silently rewritten.
- **Extract placeholders**, since each adapter knows its own interpolation syntax, which is what
  core's integrity check compares against.
- **Resolve a file to an adapter.** `AdapterRegistry` (`src/registry.ts`) returns `resolved`,
  `no-match`, or `ambiguous` rather than throwing.

## Boundaries

It must not:

- Depend on anything but `@verbatra/core`, or import from `sdk`, `cli`, `studio`, `mcp`,
  `exchange`, or `extract`.
- Import `node:fs` directly. The file system is a port: every factory takes
  `fs: AdapterFs = nodeAdapterFs` (`src/fs-port.ts`), and `fs-port.no-direct-node-fs.test.ts`
  scans every non-test source file in the package and fails if one reaches for `node:fs`.
- Grow `SupportedFormat` for a format verbatra does not ship. That set stays closed; a third-party
  adapter names itself with a `custom:` identifier and is built on the construction surface that
  `@verbatra/sdk` re-exports.

## Layout

- `src/adapter.ts`: the `FormatAdapter` interface.
- `src/json/tree-file-adapter.ts` and `src/flat/flat-file-adapter.ts`: the two shared factories.
- `src/<format>/`: one folder per format (`i18next`, `xliff`, `yaml`, `arb`, `properties`,
  `xcstrings`, and so on).
- `src/registry.ts` and `src/default-registry.ts`: resolution and the default registration order.
- `src/fs-port.ts`: the file-system port.

## Extending

Build on one of the two shared factories, never on the `FormatAdapter` interface by hand:
`createTreeFileAdapter` for nested-tree formats, or `createFlatFileAdapter` for flat key/value
formats. A built-in format also needs its member in `SUPPORTED_FORMATS`
(`packages/core/src/model/supported-format.ts`), then registration in `default-registry.ts` and an
export from `src/index.ts`. Ordered steps are in [`CONTRIBUTING.md`](../../CONTRIBUTING.md); binding
rules, including the one hand-rolled exception, in
[`.claude/rules/architecture.md`](../../.claude/rules/architecture.md).

## Development

```bash
pnpm turbo run test --filter=@verbatra/format-adapters
```

Coverage gate: 90 percent on lines, functions, statements, and branches.

## Related

- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for setup, commit and changeset rules.
- [`@verbatra/core`](../core/README.md), the package this one builds on.

Licensed under the [MIT License](../../LICENSE).
