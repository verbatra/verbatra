---
"@verbatra/studio": patch
---

Stop the Studio dashboard from tripping its own Content-Security-Policy.

Previously the first request the browser validated made zod probe for `new Function`, which the
dashboard's `script-src 'self'` policy refuses, so every session logged a `script-src eval`
violation in the console, although validation still worked.

Now the client configures zod with `jitless: true` before any schema runs, so no eval is attempted.
