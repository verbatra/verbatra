---
"@verbatra/sdk": patch
---

A rejected Anthropic request now says what to check, and a failed request no longer promises a retry that cannot help.

**Fixed**
- An Anthropic `HTTP 400` now adds a check that the model id exists and that the model supports the parameters verbatra sends. The API's own message is still never printed.
- The `SUB_BATCH_FAILED` notice says `it will be retried next run` only after a rate limit, timeout, server or network failure. After a rejected request (a 4xx status) or a credentials failure it says `running again will fail the same way until the cause is fixed`.

**Upgrade:** the notice used to end with `and was withheld; it will be retried next run.` for every failure. For a 4xx status or a credentials failure it now ends with `and was withheld; running again will fail the same way until the cause is fixed.` Code that matches the whole text should match the `SUB_BATCH_FAILED` code and `causeCode` instead.
