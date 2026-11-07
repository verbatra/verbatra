---
"@verbatra/studio": minor
---

See which locale files changed since the last commit, and which keys changed in each, on Overview.

- **Where:** a **Changes** section on Overview, under the locale table, lists the locale files, `verbatra.lock.json` and `verbatra.provenance.json` that differ from the last commit, each marked Modified, Added, Deleted, Untracked or Conflicted, with the checked-out branch. It shows ten files and a **Show all N files** button for the rest.
- **Key changes:** a **Key changes** button per locale opens the keys that were changed, added or removed against the last commit, with the old and new text side by side. A changed or added key that the source also has links to its entry in Translations. A list holds at most 500 keys, a text is cut at 2000 characters, and Studio says when a list is incomplete or a text was cut. A file with unresolved merge conflicts shows its state and no key changes.
- **Quiet when git is not there:** a project that is not in a git repository, a missing or too old git, a repository git refuses over ownership, a bare repository, a locale file outside the project folder and a project with a custom format adapter each get a plain explanation instead of an error. A read that times out or fails shows the page's error with its Retry. Nothing is written to git, and no key or path is sent to it from the browser.
- **Always current:** the section reads again when a locale, lock or provenance file changes, when git's index or `HEAD` changes (a commit, a branch switch, a reset, `git add`) and when you return to the Studio tab. A background read never moves your focus or scroll.
- **Long values:** a long token such as an HTML tag or a long placeholder now wraps in the Translations and Review value views instead of widening the page.
