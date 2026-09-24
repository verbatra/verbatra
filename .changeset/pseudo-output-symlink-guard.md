---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Refuse a `pseudo --out` directory that reaches outside the project through a symbolic link.

Previously `pseudolocalize` and `verbatra pseudo` only checked the output directory as written, so
a linked directory pointing outside the project received the pseudolocale file.

Now the output directory and the pseudolocale file are checked again after symbolic links are
resolved. A link that carries either outside the working directory, onto the working directory
itself, or onto a locale file, the lock file or another file the project depends on is refused with
`PSEUDO_OUTPUT_CONFLICT` before anything is read or written.
