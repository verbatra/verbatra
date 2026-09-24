---
"@verbatra/sdk": patch
---

Refuse a pseudolocale output that reaches a locale directory through a symbolic link.

Previously `pseudolocalize` refused an output directory that would place the pseudolocale beside a
configured locale file only as written, so a link such as `pseudo/locales -> ../locales` carried
the file next to the real translations. The refusal also printed the absolute path.

Now the same rule runs again on the paths with symbolic links resolved, and the message names the
file relative to `cwd`. The output guards also resolve the working directory and the reserved
project files once per run instead of once per checked path.
