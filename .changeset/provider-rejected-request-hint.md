---
"@verbatra/sdk": patch
---

A rejected Anthropic request now says what to check, and a failed request no longer promises a retry that cannot help.

**Fixed**
- An Anthropic `HTTP 404` now adds a check that the model id exists, and an `HTTP 400` adds that the model may not support the parameters verbatra sends. The API's own message is still never printed.
- The `SUB_BATCH_FAILED` notice says `it will be retried next run` after a `RATE_LIMITED`, `TIMEOUT`, `PROVIDER_UNAVAILABLE`, `INVALID_RESPONSE` or `OUTPUT_TRUNCATED` failure, after a `PROVIDER_ERROR` without a 4xx status, or with 408 or 429 (a network failure, a timeout or a rate limit), and after a failure that is not a `ProviderError`.
- It says `running again will fail the same way until the cause is fixed` after `AUTH_FAILED`, `MISSING_API_KEY`, `INVALID_REQUEST`, `PROVIDER_REFUSED`, `PROVIDER_BLOCKED` or `NETWORK_POLICY_VIOLATION`, and after a `PROVIDER_ERROR` with a 4xx status other than 408 and 429.

**Added**
- `ProviderError` gains an optional `status` field holding the HTTP status of the provider response behind the failure. It is absent when there was no response.

- **Upgrade:** the notice used to end with `and was withheld; it will be retried next run.` for every failure. For the codes and 4xx statuses above it now ends with `and was withheld; running again will fail the same way until the cause is fixed.` Code that matches the whole text should match the `SUB_BATCH_FAILED` code, its `causeCode` and the error's `status` instead.
