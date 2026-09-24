---
"@verbatra/studio": minor
---

Edit a translation side by side with its source, context, glossary terms, and integrity.

Previously the editor showed the source above a text area, with no context and no preview. It now
opens wide with two columns: the source with its placeholders, ICU syntax, and markup highlighted,
the key's description when the file gives one, and the glossary terms its source uses; and the
translation with who wrote the current value, its integrity indicator, the draft's length against
the source's (highlighted when it exceeds the key's `maxLength`), a check of the draft against the
glossary as you type (term used, missing, or forbidden rendering used, with red kept for a
forbidden rendering the draft actually uses), and a highlighted preview for every locale. Opened
from the Review queue, it shows why the entry was flagged. Ctrl or Cmd with Enter saves. The
context comes from the new read-only `key.context` method, registered as the agent tool
`verbatra_key_context`, which takes an optional `draft`, reports `maxLength`, and answers with an
empty glossary and a `glossaryNotice` when the glossary cannot be read.
