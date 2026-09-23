---
"@verbatra/mcp": minor
---

Add the free `translation.estimate` tool and let `translation.translatePending` take `locales` and `maxTokens`.

Previously `translation.translatePending` took no parameters, so an agent could only translate
every locale with no ceiling, and had no way to price a run before spending.

Now `translation.estimate` returns the same result as `translate --estimate --json`, optionally for
a subset of locales. It is always listed, calls no provider, and makes no network request.
`translation.translatePending` accepts an optional `locales` list, checked against the configured
target locales, and an optional `maxTokens` hard ceiling for the call; the lower of it and the
config's `maxTokens` applies. The server instructions now recommend an estimate before any spend
call.

`translation.translatePending` is now also guarded as a whole: while one run is in progress, a
second call is refused as already in progress, whatever `locales` it names.
