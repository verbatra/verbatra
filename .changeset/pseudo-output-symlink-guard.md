---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Refuse a `pseudo --out` directory that reaches outside the project or a locale directory through a
symbolic link.

Previously `pseudolocalize` and `verbatra pseudo` only checked the output directory as written, so
a linked directory pointing outside the project received the pseudolocale file, and a link such as
`pseudo/locales -> ../locales` carried it next to the real translations. The refusal also printed
the absolute path.

Now the output directory and the pseudolocale file are checked again after symbolic links are
resolved. A link that carries either outside the working directory, onto the working directory
itself, beside a configured locale file, or onto a locale file, the lock file or another file the
project depends on is refused with `PSEUDO_OUTPUT_CONFLICT` before anything is read or written, and
the message names the file relative to `cwd`. The output guards also resolve the working directory
and the reserved project files once per run instead of once per checked path.
