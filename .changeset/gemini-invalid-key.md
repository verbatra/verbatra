---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Report an invalid Gemini API key as an authentication failure.

- **Gemini:** an invalid key, which Gemini answers with HTTP 400 and the reason `API_KEY_INVALID`, is now `AUTH_FAILED` and names `GEMINI_API_KEY`, not a bare `PROVIDER_ERROR` "HTTP 400". Every other HTTP 400 is unchanged.
- **Upgrade:** a script that branched on `PROVIDER_ERROR` for a bad Gemini key must now branch on `AUTH_FAILED`.
