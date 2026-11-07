---
"@verbatra/studio": minor
---

See how one translation changed from commit to commit and restore an earlier value from the key editor.

- **History tab:** the key editor gets a History tab for one locale of the open key. It lists the working-tree value that is not committed yet, then each commit that changed the key with its author, date, subject, where the value came from and a word-level difference from the value before it. Studio says when the list may be incomplete (older commits were not read, the clone is shallow, a file could not be read) and when git is not available.
- **Restore:** a revision offers Restore, which loads that value as a draft in the editor; nothing is written until you save, and the usual checks run on save. If the source text has changed since that commit, or Studio cannot tell, Restore first asks you to confirm, because saving marks the key up to date and feeds translation memory. A value that held an API key is shown as `[REDACTED]` and cannot be restored. Restoring while a draft has unsaved changes asks before it replaces them.
- **Agents:** the `verbatra_history_keyRevisions` WebMCP tool returns the same read-only history to a browser agent, with keys scrubbed from values, diffs, subjects and author names.
