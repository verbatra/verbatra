# @verbatra/exchange

> Private package. Not published. Its source is bundled into `@verbatra/sdk` by tsup
> (`WORKSPACE_INTERNALS` in `packages/sdk/tsup.config.ts`), so a change here ships inside the sdk's
> published bytes and needs a changeset naming `@verbatra/sdk`. Do not install this directly;
> install [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk).

Translator interchange for verbatra: build and read styled Excel workbooks over a neutral,
format-agnostic row model, and read and write TMX translation memory. This is the handoff layer
between verbatra and a human translator, or between verbatra and another translation tool.

## Responsibilities

- **Excel workbooks.** `buildWorkbook` and `readWorkbook` write and read one styled sheet per
  locale over the neutral `WorkbookRow` model, with the column layout, instructions sheet, and
  review status columns the translator sees.
- **Delimited handoffs.** `buildDelimited` and `readDelimited` produce and consume one
  `<locale>.csv` or `<locale>.tsv` per locale, for a handoff meant to be diffed and reviewed.
- **TMX translation memory.** `buildTmx` and `readTmx` export and import the project's memory as
  TMX, including the units another tool produced and the reasons a unit was skipped.
- **Bounds and guards.** Explicit workbook, delimited, and TMX limits, a formula guard so a cell
  starting with `=` cannot become a spreadsheet formula, a zip guard against archive bombs, and XML
  prolog and character handling for the TMX side.

## What it must not do

- Depend on `@verbatra/core`. It does not, and it should not start: exchange sits parallel to the
  `core <- format-adapters / ai-providers` line and joins the graph at the sdk. Its only workspace
  dependency is `@verbatra/config`, as a devDependency, for shared build, lint, and test config.
- Depend on `sdk`, `cli`, `studio`, `mcp`, `format-adapters`, or `extract`. See
  [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md).
- Call a provider, read a config file, or know anything about locale-file formats. It handles rows
  and translation units; the sdk maps those to and from locale resources.

## Tests

```bash
pnpm turbo run test --filter=@verbatra/exchange
```

Coverage gate: 90 percent on lines, functions, statements, and branches. The suite includes
round-trip tests in both directions and an interop test over TMX files other tools produced.
