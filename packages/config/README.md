# @verbatra/config

> Private package. Not published, not bundled. Shared build, TypeScript and lint configuration for
> the verbatra monorepo, consumed as a devDependency. Nothing here reaches a published tarball, and
> a change to it needs no changeset naming `@verbatra/sdk` the way the bundled private packages do.

Every other package in the workspace takes this one as a devDependency and extends its presets, so
strictness, formatting, build shape, and the coverage gate are defined once.

## Responsibilities

- **TypeScript.** `tsconfig.base.json` is the strict base every package extends: `strict`, plus
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
  `isolatedModules`, and `NodeNext` resolution. `tsconfig.package.json` is the per-package variant.
- **Lint and format.** `biome.json` holds the rules the root `biome.json` extends, including the
  cognitive-complexity cap.
- **Build.** `tsup.base.mjs` exports `createTsupConfig`, the shared bundler shape every package's
  `tsup.config.ts` calls, including the `noExternal` and `dts.resolve` seams the sdk uses to inline
  the bundled private packages.
- **Test.** `vitest.base.mjs` exports `createVitestConfig`, which defaults tests to
  `src/**/*.test.ts`, excludes `src/index.ts` and `src/**/types.ts` from coverage, and sets the
  90 percent gate on lines, functions, statements, and branches.
- **Task graph.** `turbo.json` is the base Turborepo configuration packages extend with
  `"extends": ["//"]`.

## What it must not do

- Take a workspace dependency. It sits at the bottom of the graph with nothing below it, and
  nothing in it may import another `@verbatra/*` package. See
  [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md).
- Be imported at runtime. Its exports are configuration consumed by `tsc`, Biome, tsup, Vitest, and
  Turborepo; no shipped code path loads it.
- Hold product logic. A rule that belongs to one package belongs in that package's own config file.

## Tests

```bash
pnpm turbo run test --filter=@verbatra/config
```

The suite covers the two config factories themselves (`tsup.base.test.mjs`,
`vitest.base.test.mjs`), so a change to a shared preset cannot silently alter every package's
build or coverage settings.
