---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Let a `.cjs` config `require("@verbatra/cli")`, and give a config whose import cannot be resolved an accurate hint.

Previously `@verbatra/cli` exported only an ES module entry, so a `verbatra.config.cjs` calling
`require("@verbatra/cli")` failed with `CONFIG_INVALID` and `No "exports" main defined`. The package
now ships a CommonJS build of `defineConfig`, `VerbatraConfig` and `CLI_ERROR_CODES` under a
`require` condition, with its own declarations.

A config that fails to load because an import could not be resolved now carries the resolution
code as `causeCode` (such as `MODULE_NOT_FOUND`), and its hint says to install or fix that import
instead of pointing at a config field.
