---
"@verbatra/cli": patch
---

Describe `studio --verbose` as what it forwards.

Previously the help said `--verbose` also printed Studio's own startup banner, which it never
forwards.

Now the help says it prints one stderr line per request with the session token masked, and never
the startup banner.
