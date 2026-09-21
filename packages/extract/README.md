# @verbatra/extract

> Private package. Not published. Its source is bundled into `@verbatra/sdk` by tsup
> (`WORKSPACE_INTERNALS` in `packages/sdk/tsup.config.ts`), so a change here ships inside the sdk's
> published bytes and needs a changeset naming `@verbatra/sdk`. Do not install this directly;
> install [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk).

Source-code extraction for verbatra: find translation call sites in application source and report
them as keys, values, and locations. It is a distinct capability class from `format-adapters`, code
to intermediate representation rather than file to intermediate representation, with its own
Strategy family and its own file-system port.

## Responsibilities

- **Find call sites.** `SourceExtractor` (`src/extractor.ts`) is the strategy interface;
  `createI18nextExtractor` (`src/i18next/`) is the shipped implementation, covering the framework
  names listed in `SOURCE_FRAMEWORKS`.
- **Scan a project.** `scanProject` (`src/scan-project.ts`) walks the discovered source files and
  reports extracted keys, key prefixes, unresolved and dynamic call sites, key conflicts, and
  diagnostics, each with a `SourceLocation`.
- **Find untranslated literals.** `scanLiterals` (`src/literals/`) reports hardcoded user-facing
  strings and the reasons a candidate was suppressed, which is what `verbatra doctor --literals`
  renders.
- **Discovery.** `src/discovery.ts` decides which files are source at all, including the template
  extensions a framework adds.

These feed `verbatra extract`, `verbatra diff --unused`, and `verbatra doctor --literals` through
the sdk flows in `packages/sdk/src/flow/`.

## What it must not do

- Depend on `@verbatra/core`. It does not: `zod` is its only runtime dependency, and its one
  workspace dependency is `@verbatra/config` as a devDependency. Like `exchange`, it joins the
  graph at the sdk rather than sitting on the `core <- format-adapters / ai-providers` line.
- Depend on `sdk`, `cli`, `studio`, `mcp`, `format-adapters`, or `exchange`. See
  [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md).
- Import `node:fs` directly. The file system is a port (`src/source-fs-port.ts`), and
  `source-fs-port.no-direct-node-fs.test.ts` fails the suite if a non-test source file reaches for
  `node:fs`.
- Write anything. Extraction reports; the sdk decides what to add to the source locale file.

The decision record is [`docs/adr/0001-source-string-extraction.md`](./docs/adr/0001-source-string-extraction.md).

## Tests

```bash
pnpm turbo run test --filter=@verbatra/extract
```

Coverage gate: 90 percent on lines, functions, statements, and branches.
