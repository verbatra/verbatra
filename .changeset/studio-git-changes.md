---
"@verbatra/studio": minor
---

See which locale files changed since the last commit, and which keys changed in each, on Overview.

- **Where:** a **Changes** section on Overview, under the locale table, lists the locale files, `verbatra.lock.json` and `verbatra.provenance.json` that differ from the last commit, each marked Modified, Added, Deleted, Untracked or Conflicted, with the checked-out branch.
- **Key changes:** a **Key changes** button per locale opens the keys that were changed, added or removed against the last commit, with the old and new text side by side. A changed or added key links to its entry in Translations. A list holds at most 500 keys, a text is cut at 2000 characters, and Studio says when a list is incomplete. A file with unresolved merge conflicts shows its state and no key changes.
- **Quiet when git is not there:** a project that is not in a git repository, a missing or too old git, a repository git refuses over ownership, a bare repository and a project with a custom format adapter each get a plain explanation instead of an error. Nothing is written to git, and no key or path is sent to it from the browser.
- **Refresh:** the section reads again when a locale, lock or provenance file changes. A `git commit` or `git add` alone does not touch those files, so it shows after the next change or a reload.
