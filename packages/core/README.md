# @verbatra/core

> Private package. Not published. Its source is bundled into `@verbatra/sdk` by tsup
> (`WORKSPACE_INTERNALS` in `packages/sdk/tsup.config.ts`), so a change here ships inside the sdk's
> published bytes and needs a changeset naming `@verbatra/sdk`. Do not install this directly;
> install [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk).

## Purpose

Pure domain core for verbatra: model, diffing, validation. It is the bottom of the dependency
graph: `format-adapters`, `ai-providers`, and the sdk reach their shared concepts through this
one. `exchange` and `extract` do not depend on it and join the graph at the sdk instead.

## Responsibilities

- **Domain model.** `LocaleResource`, `TranslationEntry`, the closed `SupportedFormat` set of
  built-in formats (`src/model/supported-format.ts`), and the `FormatId` union that lets an outside
  adapter name itself with a `custom:` identifier without joining that set (`src/model/`).
- **Diffing.** `diffResources` decides which keys are missing, stale, or up to date, and
  `similarityRatio`/`similarityAtLeast` back fuzzy reuse (`src/diff/`).
- **Hashing.** `contentHash`, `stableStringHash`, and `normalizeText` produce the baseline the lock
  file records, which is what makes a run incremental (`src/hash/`).
- **Placeholder and markup integrity.** `checkPlaceholders` and `compareInlineMarkup` are the
  checks the sdk's integrity gate calls before any candidate translation is written
  (`src/placeholder/`).
- **Validation and consistency.** `assessValueDegeneracy` and `findInconsistentTranslations`
  (`src/validation/`, `src/consistency/`).
- **Pseudolocalization.** `pseudolocalizeValue`, the transform behind `verbatra pseudo`
  (`src/pseudo/`).
- **Locale tags.** Locale-tag and POSIX-spelling helpers (`src/locale/`).

## Boundaries

It must not:

- Do I/O of any kind: no file system, no network, no process or environment access. Nothing here
  reads a file or calls a provider.
- Take workspace dependencies. `zod` is the only runtime dependency, and `scripts/verify-core-runtime-imports.test.mjs`
  scans every non-test source file under `src/` and fails if one imports anything other than `zod`
  or a relative module. `parse5` is a devDependency used only as a test oracle and can never leak
  into the runtime.
- Import from `format-adapters`, `ai-providers`, `exchange`, `extract`, `sdk`, `cli`, `mcp`, or
  `studio`. The arrow points one way; see [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md).

## Layout

- `src/model/`: the domain types and the closed format set.
- `src/diff/`, `src/hash/`, `src/placeholder/`, `src/validation/`, `src/consistency/`,
  `src/pseudo/`, `src/locale/`: one folder per responsibility above.
- `src/index.ts`: the package barrel.
- `src/pure.ts`: the second entry, `@verbatra/core/pure`, which exposes only the zod-free diff,
  hash and placeholder functions for a browser consumer.

## Development

```bash
pnpm turbo run test --filter=@verbatra/core
```

Coverage gate: 90 percent on lines, functions, statements, and branches.

## Related

- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for setup, commit and changeset rules.
- [`@verbatra/format-adapters`](../format-adapters/README.md) and
  [`@verbatra/ai-providers`](../ai-providers/README.md), the packages built on this one.

Licensed under the [MIT License](../../LICENSE).
