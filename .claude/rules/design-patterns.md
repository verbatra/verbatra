# Design patterns

Reference catalog for JS/TS creational, structural, and behavioral patterns:
https://www.dofactory.com/javascript/design-patterns

Prefer extending a pattern already present in this codebase over introducing a new one. When a
genuinely new pattern is needed, check dofactory's catalog for a named shape rather than inventing
an ad hoc structure.

## Patterns already structurally present here

- **Strategy**: `TranslationProvider` (`packages/ai-providers/src/provider.ts`) and
  `FormatAdapter` (`packages/format-adapters/src/adapter.ts`) are both single interfaces with
  multiple interchangeable implementations (five providers, eight adapters) selected at runtime.
  A new provider or format adapter is a new strategy implementation, not a branch in existing code.

- **Factory (+ Registry)**: `providerFactories` in `packages/sdk/src/config/provider-config.ts`
  is a mapped-type table from provider id to a factory function (`buildProvider` reads it).
  `createDefaultRegistry` in `packages/format-adapters/src/default-registry.ts` builds an
  `AdapterRegistry` (`packages/format-adapters/src/registry.ts`) by registering one adapter
  instance per format. Both are the single source of truth for "what's available"; do not add a
  second resolution path (`ProviderRegistry` in `packages/ai-providers/src/registry.ts` exists but
  is explicitly not on the resolution path, per `CONTRIBUTING.md`, precisely because a second path
  invites drift).

- **Factory Function (object factories)**: `createTreeFileAdapter`
  (`packages/format-adapters/src/json/tree-file-adapter.ts`) and `createFlatFileAdapter`
  (`packages/format-adapters/src/flat/flat-file-adapter.ts`) are factory functions that take format-
  specific options (parse, serialize, placeholder extraction) and return a fully-formed
  `FormatAdapter` object, so each concrete adapter is a thin configuration of a shared shape rather
  than a new class.

- **Adapter**: every format adapter under `packages/format-adapters/src/*/` converts a specific
  file format to and from core's neutral `LocaleResource` intermediate representation, the
  textbook Adapter role: incompatible interfaces (i18next JSON, XLIFF XML, Java `.properties`)
  made to conform to one shared contract (`FormatAdapter`) that the rest of the system depends on.

When adding a new format or provider, follow the existing Strategy + Factory shape (see
`architecture.md` in this directory and `CONTRIBUTING.md`'s "Adding a provider or a format
adapter") rather than designing a new extension mechanism.
