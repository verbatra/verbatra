---
"@verbatra/sdk": patch
---

Update bundled runtime dependencies.

- **@verbatra/sdk:** @anthropic-ai/sdk 0.137.0 -> 1.8.0.
- **Anthropic:** the provider keeps calling API version `2023-06-01` and keeps sending the key as `X-Api-Key`. No action needed.
- **Upgrade:** an `ANTHROPIC_AUTH_TOKEN` in the environment used to be sent as an extra `Authorization` header; it is no longer sent. A gateway behind `ANTHROPIC_BASE_URL` now receives only `ANTHROPIC_API_KEY`, as `X-Api-Key`.
