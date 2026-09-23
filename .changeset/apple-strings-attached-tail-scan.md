---
"@verbatra/sdk": patch
---

Decide whether an Apple `.strings` block comment belongs to the next entry with a linear scan.

Previously the check used a regular expression that backtracked quadratically on a long run of
spaces or tabs after the comment. It now reads each character a bounded number of times, and
which comments become descriptions is unchanged.
