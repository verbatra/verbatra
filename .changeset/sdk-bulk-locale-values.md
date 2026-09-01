---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

`@verbatra/sdk` adds `localeValues`, a bulk read returning every key's current
source and target text across requested locales in one pass, without needing
to fetch each key individually through `keyValue`. It backs client-side content
search over translation values, not just key names. Read-only: it writes
nothing and calls no provider.
