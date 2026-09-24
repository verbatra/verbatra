---
"@verbatra/sdk": patch
---

Report a glossary edit in a read-only project as `GLOSSARY_UNWRITABLE`.

Previously `updateGlossaryTerm`, and the glossary edits in `@verbatra/mcp` and `@verbatra/studio`
built on it, surfaced a raw `EACCES` error when the glossary write lock could not be created,
because the lock was taken outside the handling that maps write failures.

Now a lock that cannot be created is reported as `GLOSSARY_UNWRITABLE`, naming the lock file and
the file-system code, and a failed glossary write carries the file-system error as its `cause`.
`LOCK_CONTENDED` and other structured errors are unchanged.
