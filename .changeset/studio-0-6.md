---
"@verbatra/studio": minor
---

Side-by-side editor, review queue with bulk and keyboard review, provenance badges, per-locale glossary, RTL display.

**Upgrading from 0.5**
- Node.js `^22.18.0 || >=24` is required (0.5 accepted `>=22.14.0`); Node 23 is not supported.
- `startStudioServer({ cwd })` roots the server at the directory of the config the search found; pass a `loader` that uses `configPath` to keep `cwd`.
- The Review queue is built from the committed files. Approve and Reject write files (Reject removes the value) and are limited to 60 calls a minute (`reviewDecisionRateLimitMax`, `reviewDecisionRateLimitWindowMs`). `METHOD_RATE_LIMITED` carries `retryAfterSeconds`.
- A spend method called while spending is off answers `SPEND_DISABLED` (HTTP 403) instead of `METHOD_UNKNOWN`, and spend is withheld under `provider: none`.
- `key.integrity` fails with `UNKNOWN_KEY` for an unknown key, and `verbatra_locale_values` returns one page of 200 entries by default, at most 1,000, with a `nextCursor`; pass `limit` and `cursor`.

**Editor and review**
- The editor shows the source with highlighted placeholders, the description and glossary terms, and the translation with its author, integrity, length against `maxLength` and a live glossary check. Ctrl or Cmd with Enter saves.
- The Translations list filters by locale and by **Missing**, **Changed**, **Orphaned**, **Protected**, **Review queue** and **Integrity problems**. Each key shows an origin badge, and edits are recorded as `human` (dialog) or `agent` (tool). Retranslating a protected key offers **Replace anyway**.
- The review queue shows each row's origin and flags, with **Approve all** for a locale and bulk **Approve selected**, **Reject selected** and, with `--allow-spend`, **Retranslate selected**. `j`, `k`, `a`, `r`, `e`, `t` and `?` drive it from the keyboard.

**Settings and display**
- The Settings glossary edits glossary v2 terms and a **Do not translate** list.
- Right-to-left text follows each locale's direction, with placeholders isolated left to right.

**Agent tools**
- New: `verbatra_translation_estimate`, `verbatra_key_context`, `verbatra_locale_integrity`, `verbatra_review_approve` and `verbatra_review_reject` (reviewer name required). `verbatra_translation_translatePending` takes `locales` and `maxTokens`.
