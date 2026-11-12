---
"@verbatra/studio": patch
---

Fix three misleading or unclear spots in the dashboard.

- **Overview:** the Last run card now says how many locales failed or finished partially, and no longer claims the run called no provider when it did.
- **Translations:** the banner no longer reads "Everything is in sync" above keys that need attention; with entries still awaiting review it says the locale files are in sync and names what is waiting.
- **Review:** the Edit, Approve, Reject and Retranslate buttons now carry the key and locale in their accessible names. The visible text and shortcuts are unchanged.
- **Agent tools:** `verbatra_usage_summary` now returns an optional `incomplete` field with the number of locales that failed or stopped partway, and its description says so.
