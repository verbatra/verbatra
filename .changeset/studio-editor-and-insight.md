---
"@verbatra/studio": minor
---

Side-by-side editor, state filters, provenance badges, per-locale glossary, RTL display.

**Upgrading from 0.5**
- Retranslating a protected key is refused and offers **Replace anyway**.
- Spend is withheld under `provider: none`, even with `--allow-spend`, and the Settings page says
  why.

**Editor and keys**
- The editor shows the source with highlighted placeholders, ICU syntax and markup, the key's
  description, its glossary terms, and the translation with its author, integrity, length against
  `maxLength`, a live glossary check and a preview. Ctrl or Cmd with Enter saves.
- The Translations list filters by locale and by **Missing**, **Changed**, **Orphaned**,
  **Protected**, **Review queue** and **Integrity problems**, which judges every translated key.
- The key view shows an **ICU arms mismatch** and names each wrong arm.

**Provenance and protection**
- Each key carries an origin badge, the key drawer shows each locale's record, and the lock file
  details count values by origin. The dashboard refreshes when the provenance file changes.
- Protected and pinned keys are marked `Protected`. Edits from the dialog are recorded as `human`,
  and from the agent tool as `agent`.

**Glossary**
- The Settings glossary edits per-locale translations, forbidden renderings, notes, part of
  speech, case sensitivity and a **Do not translate** list.

**Display**
- Right-to-left text follows the browser's direction for each locale, with placeholders and
  markup isolated left to right, and only the value takes that direction.
- The session-expired screen says to reopen the printed URL, and an unexpected server error is
  printed in the terminal running Studio. Error messages use project-relative paths.
- The dashboard no longer trips its own Content-Security-Policy, and React loads as its own file.
- `./package.json` is exported, and an `apiKeyEnvVar` value is redacted from every response.

**Agent tools**
- New: `verbatra_translation_estimate`, `verbatra_key_context` and `verbatra_locale_integrity`.
  `verbatra_translation_translatePending` takes `locales` and `maxTokens`, and
  `verbatra_key_integrity` reports ICU arms.
- The history list and `verbatra_history_list` show each commit's author name, never the email.
- `verbatra_locale_values` reads through the `fs` and `adapterRegistry` passed to
  `startStudioServer`.
