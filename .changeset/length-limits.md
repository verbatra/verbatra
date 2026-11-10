---
"@verbatra/sdk": minor
"@verbatra/mcp": patch
---

Set per-key length limits in `verbatra.limits.json`, next to the lock file, with `setKeyLengthLimit`, in addition to the config's `maxLength`.

- **What you get:** `setKeyLengthLimit({ config, key, maxLength })` sets, changes or removes (`null`) a key's limit. Translate, check and export flows read it; a limit stays advisory (a longer value is flagged `MAX_LENGTH_EXCEEDED`, never refused), and the config's `maxLength` wins for a key set in both. `verbatra doctor` has a new `limits` check.
- **Fixed:** `keyContext` reported a function as `maxLength` for a key named like an object property, such as `constructor`. `check --qa` and `checkFile` now measure a generated plural form only against a limit set for its own key (for example `items_few`), as `translate` already did.
- **Upgrade:** `checkFile` and `verbatra check --file` now read `verbatra.limits.json`, and `doctor` has a new check id, `limits`. A tool that lists every check id should add it.
