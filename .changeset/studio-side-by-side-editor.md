---
"@verbatra/studio": minor
---

Edit a translation side by side with its source, context, glossary terms, and integrity.

Previously the editor showed the source above a text area, with no context and a preview only for
right-to-left locales. It now opens wide with two columns: the source with its placeholders, ICU
syntax, and markup highlighted, the key's description when the file gives one, and the glossary
terms its source uses; and the translation with who wrote the current value, its integrity
indicator, the draft's length against the source's, and a highlighted preview for every locale.
Ctrl or Cmd with Enter saves. The context comes from the new read-only `key.context` method,
registered as the agent tool `verbatra_key_context`.
