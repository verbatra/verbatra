---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Translate the text inside markup tags with LibreTranslate.

Previously every value went to LibreTranslate as plain text, so in an i18next project the words
inside `Open <b>settings</b> now` came back untranslated, while in a next-intl project the same
value was withheld with `PLACEHOLDER_UNSUPPORTED`. A value carrying HTML-style tags is now sent in
LibreTranslate's `html` format with its tags left in place and only its other placeholders masked,
the same way in both formats, and the integrity check still refuses a value whose tags came back
changed.
