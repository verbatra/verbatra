---
"@verbatra/sdk": patch
---

Attach the wrapped error as `cause` on `SOURCE_INVALID` and `PROVIDER_CONSTRUCTION_FAILED`.

Previously both codes were documented as wrapping the underlying error, but a source locale file
the adapter could not parse, an unreadable handoff, and a provider factory that threw all surfaced
with `cause` undefined.

Now the adapter, reader, or provider error is the `SdkError`'s `cause`, and the provider error's
message is redacted before it is copied into the `SdkError` message. Config load errors still carry
no `cause`, so a key written into a config file cannot travel with the error.
