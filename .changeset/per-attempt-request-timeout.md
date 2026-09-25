---
"@verbatra/sdk": patch
---

Apply a provider's `requestTimeoutMs` to each request attempt instead of the whole call.

Previously the bound covered the provider client's retries too, so a call that kept getting an
HTTP `429` or `5xx` answer, or a refused connection, often failed with `TIMEOUT` once the retries
and their backoff added up, hiding the real cause.

Now every attempt gets the full `requestTimeoutMs`, and a call fails with the cause of its last
attempt: `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, or `PROVIDER_ERROR` naming the refused
connection. `TIMEOUT` means one attempt got no answer in time, and its message names the bound. A
DeepL connection failure other than a timeout is no longer reported as `TIMEOUT`.

Gemini now also retries an attempt that timed out, like an HTTP `429` or `5xx` answer, within its
three attempts and the same backoff, instead of failing the call on the first timeout.
