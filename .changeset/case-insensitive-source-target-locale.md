---
"@verbatra/sdk": patch
---

Fix config validation to reject a target locale that case-insensitively matches the source locale (for example `sourceLocale: "de"` with `targetLocales: ["DE"]`), preventing the source locale file from being silently overwritten on case-insensitive file systems.
