# @verbatra/core

> Private package. Not published. Its source is bundled into `@verbatra/sdk` by tsup
> (`WORKSPACE_INTERNALS` in `packages/sdk/tsup.config.ts`), so a change here ships inside the sdk's
> published bytes and needs a changeset naming `@verbatra/sdk`. Do not install this directly;
> install [`@verbatra/sdk`](https://www.npmjs.com/package/@verbatra/sdk).

Pure domain core for verbatra: model, diffing, validation. It is the bottom of the dependency
graph, and every other package reaches its concepts through this one.

## Responsibilities

- **Domain model.** `LocaleResource`, `TranslationEntry`, the closed `SupportedFormat` set of
  fourteen built-in formats, and the `FormatId` union that lets an outside adapter name itself with
  a `custom:` identifier without joining that set (`src/model/`).
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

## What it must not do

- No I/O of any kind: no file system, no network, no process or environment access. Nothing here
  reads a file or calls a provider.
- No workspace dependencies. `zod` is the only runtime dependency, and `scripts/verify-core-runtime-imports.test.mjs`
  scans every non-test source file under `src/` and fails if one imports anything other than `zod`
  or a relative module. `parse5` is a devDependency used only as a test oracle and can never leak
  into the runtime.
- Never import from `format-adapters`, `ai-providers`, `exchange`, `extract`, `sdk`, `cli`, `mcp`,
  or `studio`. The arrow points one way; see [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md).

## Tests

```bash
pnpm turbo run test --filter=@verbatra/core
```

Coverage gate: 90 percent on lines, functions, statements, and branches.
