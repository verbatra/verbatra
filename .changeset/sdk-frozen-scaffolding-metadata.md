---
"@verbatra/sdk": patch
---

Freeze `scaffoldingMetadata` at every level, as its read-only documentation says.

Previously it was read-only only in its TypeScript type: at runtime a caller could rewrite a
provider's key variable or add a config file name, and every later reader in the same process,
including the CLI's `init`, would see the change. The object and each table in it are now frozen
copies, so a write throws in strict mode and never reaches another reader.
