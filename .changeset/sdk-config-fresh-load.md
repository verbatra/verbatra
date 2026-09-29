---
"@verbatra/sdk": minor
---

Reload an edited JavaScript or TypeScript config, and list the files a config can come from.

`loadConfigWithMeta` and `loadConfig` take a new `fresh` option. Without it, a process that loads
the config twice keeps the first evaluation of a `verbatra.config.ts`, `.js`, or `.cjs` file even
after the file changed; with it, the file is evaluated again. JSON, YAML, and `package.json`
configs were always read afresh. The new `configCandidatePaths` returns every file a load with the
same `cwd` and `configPath` could read a config from, in search order, so a long-running process
can notice a config being created, edited, or removed without loading it on every request.
