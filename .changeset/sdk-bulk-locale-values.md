---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

`@verbatra/sdk` adds `localeValues`, a bulk read that returns every key's current source and
target text across every requested target locale in one pass over the files already on disk. It
backs client-side content search (matching a query against translation values, not just key
names) without forcing a caller to fetch each key individually through `keyValue`. An absent
`target` means the key has not been translated in that locale yet; an absent `source` means the
key is orphaned. Read-only: it writes nothing and calls no provider.
