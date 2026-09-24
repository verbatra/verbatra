---
"@verbatra/sdk": patch
---

Document which `SdkError` codes carry a `cause` and that a provider construction `cause` is not
redacted.

Previously the `SdkError` reference left `GLOSSARY_UNWRITABLE` out of the codes that carry a
`cause`, and did not say that only the `PROVIDER_CONSTRUCTION_FAILED` message is redacted.

Now the list is complete, and the reference states that the `cause` is the original error, returned
as is from a caller-supplied `createProvider`.
