---
"@verbatra/studio": patch
---

Show a key's source file description in the key details drawer.

The editor already showed the context a source file gives translators for a key; the key details
drawer on the Translations page now shows it too, under the source text. The review table's
checkboxes also drop a redundant `aria-checked` that duplicated the native checkbox state.
