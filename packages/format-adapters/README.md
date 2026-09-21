# @verbatra/format-adapters

> Private package. Not published. Its source is bundled into `@verbatra/sdk` by tsup
> (`WORKSPACE_INTERNALS` in `packages/sdk/tsup.config.ts`), so a change here ships inside the sdk's
> published bytes and needs a changeset naming `@verbatra/sdk`. Do not install this directly;
> install [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk).

Format adapters for verbatra: file formats to and from core's intermediate representation. One
interface, `FormatAdapter`, with one implementation per format, so the rest of the system never
learns what a `.xcstrings` catalog or a gettext `.po` header looks like.

## Responsibilities

- **Read and write every built-in format.** Fourteen adapters registered in detection order by
  `createDefaultRegistry` (`src/default-registry.ts`): i18next, vue-i18n, next-intl and
  ngx-translate JSON, XLIFF, YAML, Flutter ARB, Java/Spring `.properties`, Apple
  `.strings`/`.stringsdict`, Apple `.xcstrings`, Android `strings.xml`, gettext, INI, .NET `.resx`.
- **Preserve the file.** Document key order, line endings, comments, and format-specific metadata
  survive a round trip; a file that cannot be represented faithfully fails with a structured
  `AdapterError` rather than being silently rewritten.
- **Extract placeholders**, since each adapter knows its own interpolation syntax, which is what
  core's integrity check compares against.
- **Resolve a file to an adapter.** `AdapterRegistry` (`src/registry.ts`) returns `resolved`,
  `no-match`, or `ambiguous` rather than throwing.

## What it must not do

- Depend on anything but `@verbatra/core`. Never import from `sdk`, `cli`, `studio`, `mcp`,
  `exchange`, or `extract`.
- Import `node:fs` directly. The file system is a port: every factory takes
  `fs: AdapterFs = nodeAdapterFs` (`src/fs-port.ts`), and `fs-port.no-direct-node-fs.test.ts`
  scans every non-test source file in the package and fails if one reaches for `node:fs`.
- Grow `SupportedFormat` for a format verbatra does not ship. That set stays closed; a third-party
  adapter names itself with a `custom:` identifier, per
  [`docs/decisions/0001-third-party-format-adapters.md`](../../docs/decisions/0001-third-party-format-adapters.md).

## Extending

Build on one of the two shared factories, never on the `FormatAdapter` interface by hand:
`createTreeFileAdapter` (`src/json/tree-file-adapter.ts`) for nested-tree formats, or
`createFlatFileAdapter` (`src/flat/flat-file-adapter.ts`) for flat key/value formats. Then register
the adapter in `default-registry.ts` and export it from `src/index.ts`. Ordered steps are in
[`CONTRIBUTING.md`](../../CONTRIBUTING.md); binding rules, including the one hand-rolled exception,
in [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md).

## Tests

```bash
pnpm turbo run test --filter=@verbatra/format-adapters
```

Coverage gate: 90 percent on lines, functions, statements, and branches.
