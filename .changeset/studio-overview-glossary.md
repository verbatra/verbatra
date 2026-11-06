---
"@verbatra/studio": minor
---

Studio opens on a new Overview page with coverage per locale, the last run and file history; the glossary has its own page.

- **Overview:** the first page holds four status figures (needs attention, waiting for review, average coverage, locales in sync), a table of every locale's coverage and lock state, the last run's token usage and budget, and the git history of your locale files. It replaces the Activity page, and `#/activity` links keep working. The history lists the latest 10 commits with date and time, with a button for more. The attention figure links to the missing, changed and orphaned keys, the review figure links to Review, and each locale row links to its keys and its review queue.
- **Overview coverage and errors:** the locale table lists the worst covered locales first and shows ten, with a button for the rest. When a read fails, the page shows one error with the server's reason and a Retry button instead of a loading caption, and a failed refresh keeps the last data with a notice. Following a link opens the next page at its top.
- **Glossary:** the glossary is edited on its own page and no longer on Settings, which keeps the configuration and what the session may do.
- **Glossary safety:** removing a term or a do-not-translate entry, or saving a term with no translation left, asks first and names what is lost (translations, never-use rules, note, part of speech, Match case). Unsaved edits ask before you leave the page, reload or switch locale, and adding a term that already has a translation offers Edit instead of overwriting it. A failed write shows its reason next to the row or form, with Retry when repeating can help, and writes no longer overwrite each other.
- **Glossary search and refresh:** search narrows the terms, the page reloads when your locale files or the glossary file change, leaving an unsaved edit as it is (a term that disappeared keeps its draft with a notice). Never-use renderings are one per line, so a comma stays part of a rendering, and a failed read offers Retry. Settings also shows whether Studio may write files, its rate limits and the glossary source.
- **Translations:** the page now holds only the key table, its filters and the key editor.
- **Default page:** an address without a page, or with an unknown one, opens Overview instead of Translations.
