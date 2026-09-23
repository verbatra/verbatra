---
"@verbatra/studio": minor
---

Add the free `verbatra_translation_estimate` agent tool and let `verbatra_translation_translatePending` take `locales` and `maxTokens`.

Previously the whole-project translate tool took no parameters and there was no way to price a run
from the dashboard's agent tools.

Now `translation.estimate` returns the same result as `translate --estimate --json`, optionally for
a subset of locales, is registered whether or not spending is allowed, and calls no provider.
`translation.translatePending` accepts an optional `locales` list and an optional `maxTokens` hard
ceiling for the call; the lower of it and the config's `maxTokens` applies.
